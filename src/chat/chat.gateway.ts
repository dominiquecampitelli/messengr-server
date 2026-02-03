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

interface ChatSocketData {
  userName: string;
  roomId: string;
}

interface StatusPayload {
  user: string;
  status: 'online' | 'offline';
}

interface MessagePayload {
  user: string;
  message: string;
}

@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  private rooms = new Map<string, Map<string, string>>();

  handleConnection() {}

  handleDisconnect(client: Socket<any, any, any, ChatSocketData>) {
    const { roomId, userName } = client.data || {};
    if (!roomId || !userName) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    room.delete(client.id);

    this.server.to(roomId).emit('user-left', {
      user: userName,
      status: 'offline',
    } satisfies StatusPayload);

    if (room.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket<any, any, any, ChatSocketData>,
    @MessageBody() payload: { roomId: string; userName: string },
  ) {
    const { roomId, userName } = payload;

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Map());
    }

    const room = this.rooms.get(roomId)!;

    if (room.size >= 2) {
      client.emit('room-full');
      return;
    }

    room.set(client.id, userName);

    client.data = {
      roomId,
      userName,
    };

    void client.join(roomId);

    this.server.to(roomId).emit('room-state', {
      users: Array.from(room.values()),
    });

    client.to(roomId).emit('user-joined', {
      user: userName,
      status: 'online',
    } satisfies StatusPayload);
  }

  @SubscribeMessage('newMessage')
  handleNewMessage(
    @ConnectedSocket() client: Socket<any, any, any, ChatSocketData>,
    @MessageBody() message: string,
  ) {
    const { roomId, userName } = client.data;

    const payload: MessagePayload = {
      user: userName,
      message,
    };

    this.server.to(roomId).emit('chat-message', payload);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket<any, any, any, ChatSocketData>,
  ) {
    const { roomId, userName } = client.data || {};
    if (!roomId) return;

    client.to(roomId).emit('typing', { user: userName });
  }

  @SubscribeMessage('stop-typing')
  handleStopTyping(
    @ConnectedSocket() client: Socket<any, any, any, ChatSocketData>,
  ) {
    const { roomId, userName } = client.data;

    client.to(roomId).emit('stop-typing', { user: userName });
  }
}
