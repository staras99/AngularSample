import {  Component, Input, OnInit, OnDestroy } from '@angular/core';
import { MessagesService } from "app/shared/services/messages.service";
import { UserProfileService } from "app/shared/services/user-profile.service";
import { NotificationsService } from 'app/shared/services/notifications.service';
import { FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';
import { validateEmptyField } from 'app/shared/empty-field-validator';
import { CustomDateTimePipe } from "app/shared/filters/customShortDateTime";

@Component({
  selector: 'app-message-list',
  templateUrl: './message-list.component.html',
  styleUrls: ['./message-list.component.css'],
})
export class MessageListComponent implements OnInit, OnDestroy {
  @Input() sort;

  messageForm: FormGroup;

  messages = [];
  connection;
  selectedMessage = {
    Id: "",
    Subject: '',
    Text: '',
    SentDate: '',
    ReadDate: '',
    ReceiverId: '',
    ReceiverFirstName: '',
    ReceiverLastName: '',
    SenderId: '',
    SenderFirstName: '',
    SenderLastName: '',
  }
  newMessage = {};
  modal;
  selfId;
  canSend = true;
  curent_message = false;
  current_messageId;

  messageIdForDelete;

  constructor(
    private _fb: FormBuilder,
    private messagesService: MessagesService,
    private userProfileService: UserProfileService,
    private systemNotification: NotificationsService) {
    }

  
  setMessageForDelete(e,id,modal){
    e.preventDefault();
    e.stopPropagation();
    (<HTMLElement>document.querySelector(".openModal")).click()
    this.messageIdForDelete = id;
  }

  delete(){
    if(this.messageIdForDelete == this.current_messageId){
      this.hideCurrent();
    }
  
    this.messagesService.deleteMessage(this.messageIdForDelete).subscribe(res => {
      this.systemNotification.create("success", "Success","The message was successfully deleted", {});
    }, error => {
      this.systemNotification.create("error", "Error", "Something went wrong, please try again", {});
    });
  }

  sendMessage(payload) {
    this.messagesService.sendMessage(payload).subscribe(res => {
      this.systemNotification.create("success", "Success","The message was successfully sent", {});
    }, error => {
      this.systemNotification.create("error", "Error", "Something went wrong, please try again", {});
    });
  }

  showCurrent($event, message) {
    this.selectedMessage = message;
    this.newMessage = {
      Subject: 'Re: ' + message.Subject,
      Text: '',
      ReceiverId: (this.selectedMessage.ReceiverId == this.selfId) ? this.selectedMessage.SenderId : this.selectedMessage.ReceiverId
    }
    if(this.selectedMessage.ReceiverId == this.selfId){
      this.messagesService.markAsReadById(message.Id);
    }

    this.curent_message = true
    this.current_messageId = message.Id;
  }

  hideCurrent() {
    this.curent_message = false
    this.current_messageId = 0;
  }

  reply(e, data, isValid) {
    e.preventDefault();

    if (isValid) {
      this.sendMessage(data)

      this.canSend = false;
      setTimeout(()=>{
        this.canSend = true
      },2000)
    }
  }
  
  setDataListener() {
    this.connection = this.messagesService.getMessages().subscribe((data: any) => {
      if(data.messages){
        this.messages = this.messagesService.sortMessagesByDate(data.messages);
      }
      
      switch (data.type) {
        case 'History':
          break
        case 'Delivered':
          this.canSend = true;
          this.newMessage = {}
          this.hideCurrent()
          break
        case 'Error':
          this.canSend = true;
          break
      }
    })
  }

  initialize() {
    this.messagesService.getAllMessages();
    this.setDataListener();
  }

  ngOnInit() {
    this.messageForm = this._fb.group({
      ReceiverId: ['', [Validators.required, validateEmptyField]],
      Subject: ['', [Validators.required, validateEmptyField]],
      Text: ['', [Validators.required, validateEmptyField]]
    });

    if(this.userProfileService.currentUser){
      this.selfId = this.userProfileService.currentUser.Id;
      
      this.initialize();
    }

    this.userProfileService.userInfoChanged$.subscribe(user => {
      if(user){
        this.selfId = user.Id;

        this.initialize();
      }
    });
  }

  ngOnDestroy() {
  }
}
