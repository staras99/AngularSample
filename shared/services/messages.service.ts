import { Injectable } from '@angular/core'
import { Subject, Observable } from 'rxjs'
import { LoginService } from './login.service'
import { UserProfileService } from './user-profile.service'
import { Config } from "app/shared/config/config"
import { Http, Response, RequestOptions, Headers, Request, RequestMethod, URLSearchParams } from '@angular/http';

@Injectable()
export class MessagesService {
  constructor(
    private http: Http,
    private loginService: LoginService,
    private userProfileService: UserProfileService,
    private config: Config){
      this.url = this.config.getSocketUrl();
      this.apiUrl = this.config.getApiUrl();
  }

  private url;
  private apiUrl;

  private reconectTime = 7000;
  private socket;
  private selfId;
  private eventParser;
  private messages = new Subject<any>();
  private unreadedCount = new Subject<number>();
  private messagesA = [];
  private events = new Subject<any>();
  unreaded = [];

  waitForConnection(callback, interval) {
    if (this.socket.readyState === 1) {
      callback();
    } else {
      var that = this;
      setTimeout(function() {
        that.waitForConnection(callback, interval);
      }, interval);
    }
  }

  sendLoginEvent() {
    this.waitForConnection(() => {
      this.socket.send(JSON.stringify({ type: 'Login', token: this.loginService.checkLogin() }));
    }, 500)
  }

  sendMessage(message) : Observable<boolean>  {
    var headers = new Headers();
    headers.append("Authorization", "Bearer " + this.loginService.checkLogin());
    headers.append("Content-Type", 'application/json');
    headers.append("Accept", 'application/json');

    return this.http.post(this.apiUrl + "api/message", JSON.stringify(message), { headers: headers }).catch(this.handleError).map(res => {
      
      var newMessages = res.json();
      
      newMessages.map(message => {
        this.messagesA.push(message);
      });
      
      this.messages.next({ type: 'Delivered', messages: this.messagesA });

      return true;
    }, error => {
      return false;
    });
  }

  getAllMessages() {
    var headers = new Headers();
    headers.append("Authorization", "Bearer " + this.loginService.checkLogin());

    this.http.get(this.apiUrl + "api/message",{ headers: headers }).catch(this.handleError).subscribe(res => {
      this.messagesA = res.json();
      this.messages.next({ type: 'History', messages: this.messagesA });

      this.countingUnreadedMessages(this.messagesA);
    });
  }

  deleteMessage(id){
      var headers = new Headers();
      headers.append("Authorization", "Bearer " + this.loginService.checkLogin());

      return this.http.delete(this.apiUrl + "api/message/" + id, { headers: headers }).catch(this.handleError).map(res => {
        this.findAndDelete(this.messagesA, res._body)
        this.messages.next({ type: 'History', messages: this.messagesA });
        this.countingUnreadedMessages(this.messagesA);
    }, error => {
    });
  }

  markAllAsRead() {
    var headers = new Headers();
    headers.append("Authorization", "Bearer " + this.loginService.checkLogin());

    this.http.get(this.apiUrl + "api/message/readall", { headers: headers }).catch(this.handleError).subscribe(res => {
      this.findAndReplace(this.messagesA, res.json());
      this.messages.next({ type: 'History', messages: this.messagesA });

      this.countingUnreadedMessages(this.messagesA);
    });
  }

  markAsReadById(id) {
    var headers = new Headers();
    headers.append("Authorization", "Bearer " + this.loginService.checkLogin());

    this.http.get(this.apiUrl + "api/message/read?id=" + id,{ headers: headers }).catch(this.handleError).subscribe(res => {

      this.findAndReplace(this.messagesA, res.json());
      this.messages.next({ type: 'History', messages: this.messagesA });

      this.countingUnreadedMessages(this.messagesA);
    });
  }

  private handleError(error: Response) {
    return Observable.throw(error || 'Server error');
  }

  eventsListener() {
    return this.events.asObservable()
  }

  getMessages() {
    return this.messages.asObservable()
  }

  getUnreadedCount() {
    return this.unreadedCount.asObservable()
  }

  init() {
    if(this.userProfileService.currentUser){
      this.selfId = this.userProfileService.currentUser.Id;
      
      this.initialize();
    }

    this.userProfileService.userInfoChanged$.subscribe(user => 
    { 
      if(user){
        if(this.selfId != user.Id){
          this.selfId = user.Id;
          
          this.initialize();
        }
      }else{
        this.close()
      }
    });
  }

  initialize(){
    this.socket = new WebSocket(this.url);

    this.socket.onopen = ((data) => {
      console.log('socket connected');
      if (this.loginService.checkLogin()) {
        this.sendLoginEvent();
      }
    })

    this.socket.onmessage = ((event) => {
      this.events.next(JSON.parse(event.data))
    })

    this.socket.onerror = ((data) => {
      this.messages.next({ type:'Error' });
      console.log('onerror');
    })

    this.socket.onclose = ((data) => {
      console.log('socket disconnected');
      if(this.eventParser){
        this.eventParser.unsubscribe()
      }

      let that = this;
      setTimeout(()=>{
        that.init()
      },that.reconectTime)
    })

    this.eventParser = this.eventsListener().subscribe((event) => {
      switch (event.Type) {
        case 'NewMessage':
          event.Messages.map( message => {
            this.messagesA.push(message);
          })

          this.messagesA = this.sortMessagesByDate(this.messagesA);          

          this.unreaded.length += event.Messages.length;
          this.unreadedCount.next(this.unreaded.length);
          break
        case 'Unreaded':
          this.unreaded = [];
          this.unreaded.length = event.Messages.length;
          this.unreadedCount.next(this.unreaded.length);
        break 
        default:
          console.log(event)
      }
    })
  }

  countingUnreadedMessages(messages)
  {
    this.unreaded = [];
    
    messages.map((message) => {
      if (!message.ReadDate && this.selfId == message.ReceiverId){
        this.unreaded.push(message);
      }
    })

    this.unreadedCount.next(this.unreaded.length);
  }

  findAndReplace(messageList, readMessages) {
    readMessages.forEach(element => {
      let index = messageList.findIndex( mess => {
        return (mess.Id == element.Id);
      });

      if(index != -1){
        messageList[index] = element;
      }
    });
  }

  findAndDelete(messageList, messageId) {
      let index = messageList.findIndex( mess => {
        return (mess.Id == messageId);
      });

      if(index != -1){
        messageList.splice(index, 1);
      }
  }

  close(){
    this.unreaded = [];
    this.messagesA = [];

    if(this.eventParser){
      this.eventParser.unsubscribe()
    }
  }

  clearUnreaded(){
    this.unreaded = [];
    this.unreadedCount.next(this.unreaded.length);
  }

  sortMessagesByDate(messages){
    return  messages.sort(function(a, b) {
      if (new Date(a.SentDate) > new Date(b.SentDate)) {
        return -1;
      }
      if (new Date(a.SentDate) < new Date(b.SentDate)) {
        return 1;
      }
      return 0;
    });
  }
}
