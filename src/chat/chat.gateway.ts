import {
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { Socket, Server } from 'socket.io';

interface RoomStatusPayload {
  status: 'available' | 'full';
}

interface ChatSocketData {
  userName: string;
}

interface StatusPayload {
  user: string;
  status: 'online' | 'offline';
}

interface MessagePayload {
  user: string;
  message: string;
}

@WebSocketGateway(3002, { cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private users = new Map<string, string>();

  handleConnection(client: Socket<any, any, any, ChatSocketData>) {
    const status: RoomStatusPayload = {
      status: this.users.size >= 2 ? 'full' : 'available',
    };

    client.emit('room-status', status);
  }

  handleDisconnect(client: Socket<any, any, any, ChatSocketData>) {
    const userName = this.users.get(client.id);
    if (!userName) return;

    this.users.delete(client.id);

    this.emitStatus('user-left', {
      user: userName,
      status: 'offline',
    } satisfies StatusPayload);
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket<any, any, any, ChatSocketData>,
    @MessageBody() userName: string,
  ) {
    if (this.users.size >= 2) {
      client.emit('room-full');
      client.disconnect();
      return;
    }

    client.data.userName = userName;
    this.users.set(client.id, userName);

    client.broadcast.emit('user-joined', {
      user: userName,
      status: 'online',
    });
  }

  @SubscribeMessage('newMessage')
  handleNewMessage(
    @ConnectedSocket() client: Socket<any, any, any, ChatSocketData>,
    @MessageBody() message: string,
  ) {
    this.emitMessage({
      user: client.data.userName,
      message,
    });
  }

  private emitStatus(
    event: 'user-joined' | 'user-left',
    payload: StatusPayload,
  ) {
    this.server.emit(event, payload);
  }

  private emitMessage(payload: MessagePayload) {
    this.server.emit('message', payload);
  }
}
