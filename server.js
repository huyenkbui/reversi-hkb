/* Setup static file server */
let static = require('node-static');

/* Set up the http server library */
let http = require('http');

/* Assume that we are running on Heroku */
let port = process.env.PORT;
let directory = __dirname + '/public';

/* If we aren't on Heroku, then we need to adjust our port and directory */
if((typeof port == 'undefined') || (port === null)) {
  port = 8080;
  directory = './public';
}

/* Set up our static file web server to deliver files from file system */
let file = new static.Server(directory);

let app = http.createServer(
  function(request, response) {
    request.addListener('end',
      function() {
        file.serve(request, response);
      }
    ).resume();
  }
).listen(port);

console.log('The server is running');

/* Set up the web socket server (real-time connections) */

/* Set up a registry of player information and their socket IDs */
let players = [];

const { Server } = require("socket.io");
const io = new Server(app);

io.on('connection', (socket) => {

  /* Output a log message on the server and send it to the clients */
  function serverLog(...messages) {
    io.emit('log', ['**** Message from the server:\n']);
    messages.forEach((item) => {
      io.emit('log', ['****\t'+item]);
      console.log(item);
    });
  }

  serverLog('a page connected to the server: '+socket.id);

  /* join_room command handler */

  /* expected payload:
    {
      'room': the room to be joined,
      'username': the name of the user joining the room
    }
  */

  /* join_room_response:
    {
      'result': 'success',
      'room': room that was joined,
      'username': user that joined room,
      'count': number of users in chat room,
      'socket_id': socket of the user that just joined room
    }

    or

    {
      'result': 'fail',
      'message': reason for failure
    }
  */

  socket.on('join_room', (payload) => {
    serverLog('Server received a command', '\'join_room\'', JSON.stringify(payload));

    /* Error-checking payload */
    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a payload';
      socket.emit('join_room_reseponse', response);
      serverLog('join_room command failed', JSON.stringify(response));
      return;
    }

    let room = payload.room;
    let username = payload.username;

    /* Error-checking room */
    if ((typeof room == 'undefined') || (room === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid room to join';
      socket.emit('join_room_reseponse', response);
      serverLog('join_room command failed', JSON.stringify(response));
      return;
    }

    /* Error-checking username */
    if ((typeof username == 'undefined') || (username === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid username to join the chat room';
      socket.emit('join_room_reseponse', response);
      serverLog('join_room command failed', JSON.stringify(response));
      return;
    }

    /* If data from client is good, handle the command */
    socket.join(room);

    /* Make sure client was put in the room */
    io.in(room).fetchSockets().then((sockets) => {
      /*Fail message for if socket didn't join the room */
      if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.includes(socket)) {
        response = {};
        response.result = 'fail';
        response.message = 'Server internal error joining chat room';
        socket.emit('join_room_reseponse', response);
        serverLog('join_room command failed', JSON.stringify(response));
      } else { /* If socket did join room */
        players[socket.id] = {
          username: username,
          room: room
        };

        /* Announce to everyone in room who else is in the room */
        for (const member of sockets) {
          response = {
            result: 'success',
            socket_id: member.id,
            room: players[member.id].room,
            username: players[member.id].username,
            count: sockets.length
          };

          /* Tell everyone that a new user has joined the chat room */
          io.of('/').to(room).emit('join_room_response', response);
          serverLog('join_room succeeded', JSON.stringify(response));
        };
      };
    });
  });

  socket.on('disconnect', () => {
      serverLog('a page disconnected from the server: '+socket.id);

      if((typeof players[socket.id] != 'undefined') && (players[socket.id] != null)) {
        let payload = {
          username: players[socket.id].username,
          room: players[socket.id].room,
          count: Object.keys(players).length - 1,
          socket_id: socket.id
        };

        let room = players[socket.id].room;
        delete players[socket.id];

        /* Tell everyone who left room */
        io.of("/").to(room).emit('player_disconnected', payload);
        serverLog('player_disconnected succeeded ', JSON.stringify(payload));
      };
  });

  /* send_chat_message command handler */

  /* expected payload:
    {
      'room': the room to which message should be sent,
      'username': the name of the sender
      'message': the message to broadcast
    }
  */

  /* send_chat_message_response:
    {
      'result': 'success',
      'username': user that sent the message,
      'message': the message that was sent
    }

    or

    {
      'result': 'fail',
      'message': reason for failure
    }
  */

  socket.on('send_chat_message', (payload) => {
    serverLog('Server received a command', '\'send_chat_message\'', JSON.stringify(payload));

    /* Error-checking payload */
    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a payload';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }

    let room = payload.room;
    let username = payload.username;
    let message = payload.message;

    /* Error-checking room */
    if ((typeof room == 'undefined') || (room === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid room to message';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }

    /* Error-checking username */
    if ((typeof username == 'undefined') || (username === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid username as a message source';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }

    /* Error-checking message */
    if ((typeof message == 'undefined') || (message === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid message';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }

    /* If data from client is good, handle the command */
    let response = {};
    response.reseult = 'success';
    response.username = username;
    response.room = room;
    response.message = message;

    /*Tell everyone in the room what the message is (broadcast) */
    io.of('/').to(room).emit('send_chat_message_response', response);
    serverLog('send_chat_message command succeeded', JSON.stringify(response));
  });
});
