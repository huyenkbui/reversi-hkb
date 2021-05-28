/* Setup static file server */
let static = require('node-static');

/* Set up the http server library */
let http = require('http');

/* Assume that we are running on Heroku */
let port = process.env.PORT;
let directory = __dirname + '/public';

/* If we aren't on Heroku, then we need to adjust our port and directory */
if ((typeof port == 'undefined') || (port === null)) {
  port = 8080;
  directory = './public';
};

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
      /* Fail message for if socket didn't join the room */
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

          if (room !== 'Lobby') {
            send_game_update(socket, room, 'initial update');
          };
        };
      };
    });
  });

  socket.on('invite', (payload) => {
    serverLog('Server received a command', '\'invite\'', JSON.stringify(payload));

    /* Error-checking payload */
    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a payload';
      socket.emit('invite_response', response);
      serverLog('invite failed', JSON.stringify(response));
      return;
    };

    let requested_user = payload.requested_user;
    let room = players[socket.id].room;
    let username = players[socket.id].username;

    /* Error-checking user */
    if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
      response = {
        result: 'fail',
        message: 'client did not request a valid user to invite to play'
      };

      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    };

    /* Error-checking room */
    if ((typeof room == 'undefined') || (room === null) || (room === "")) {
      response = {
        result: 'fail',
        message: 'user that was invited is not in a room'
      };

      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    };

    /* Error-checking username */
    if ((typeof username == 'undefined') || (username === null) || (username === "")) {
      response = {
        result: 'fail',
        message: 'user that was invited is not have a name registered'
      };

      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    };

    /* If data from client is good, handle the command */
    /* Make sure invited player is present */
    io.in(room).allSockets().then((sockets) => {
      /* Invitee is not in room */
      if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
        response = {
          result: 'fail',
          message: 'user that was invited is no longer in room'
        };

        socket.emit('invite_response', response);
        serverLog('invite command failed', JSON.stringify(response));
        return;
      } else { /* Invitee is in room */
          /* Send message to inviter */
          response = {
            result: 'success',
            socket_id: requested_user
          };
          socket.emit('invite_response', response);

          /* Send message to invitee */
          response = {
            result: 'success',
            socket_id: socket.id
          };
          socket.to(requested_user).emit('invited', response);

          serverLog('invite command succeeded', JSON.stringify(response));
      };
    });
  });

  socket.on('uninvite', (payload) => {
    serverLog('Server received a command', '\'uninvite\'', JSON.stringify(payload));

    /* Error-checking payload */
    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a payload';
      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    };

    let requested_user = payload.requested_user;
    let room = players[socket.id].room;
    let username = players[socket.id].username;

    /* Error-checking user */
    if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
      response = {
        result: 'fail',
        message: 'client did not request a valid user to uninvite'
      };

      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    };

    /* Error-checking room */
    if ((typeof room == 'undefined') || (room === null) || (room === "")) {
      response = {
        result: 'fail',
        message: 'user that was uninvited is not in a room'
      };

      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    };

    /* Error-checking username */
    if ((typeof username == 'undefined') || (username === null) || (username === "")) {
      response = {
        result: 'fail',
        message: 'user that was uninvited is not have a name registered'
      };

      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    };

    /* If data from client is good, handle the command */
    /* Make sure uninvited player is present */
    io.in(room).allSockets().then((sockets) => {
      /* Invitee is not in room */
      if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
        response = {
          result: 'fail',
          message: 'user that was uninvited is no longer in roomd'
        };

        socket.emit('uninvited', response);
        serverLog('uninvite command failed', JSON.stringify(response));
        return;
      } else { /* Uninvitee is in room */
          /* Send message to uninviter */
          response = {
            result: 'success',
            socket_id: requested_user
          };
          socket.emit('uninvited', response);

          /* Send message to uninvitee */
          response = {
            result: 'success',
            socket_id: socket.id
          };
          socket.to(requested_user).emit('uninvited', response);

          serverLog('uninvite command succeeded', JSON.stringify(response));
      };
    });
  });

  socket.on('game_start', (payload) => {
    serverLog('Server received a command', '\'game_start\'', JSON.stringify(payload));

    /* Error-checking payload */
    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a payload';
      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    };

    let requested_user = payload.requested_user;
    let room = players[socket.id].room;
    let username = players[socket.id].username;

    /* Error-checking user */
    if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
      response = {
        result: 'fail',
        message: 'client did not request a valid user to engage in play'
      };

      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    };

    /* Error-checking room */
    if ((typeof room == 'undefined') || (room === null) || (room === "")) {
      response = {
        result: 'fail',
        message: 'user that was engaged to play is not in a room'
      };

      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    };

    /* Error-checking username */
    if ((typeof username == 'undefined') || (username === null) || (username === "")) {
      response = {
        result: 'fail',
        message: 'user that was engaged to play is not have a name registered'
      };

      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    };

    /* If data from client is good, handle the command */
    /* Make sure uninvited player is present */
    io.in(room).allSockets().then((sockets) => {
      /* Engaged player is not in room */
      if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
        response = {
          result: 'fail',
          message: 'user that was engaged to play is no longer in room'
        };

        socket.emit('game_start_response', response);
        serverLog('game_start command failed', JSON.stringify(response));
        return;
      } else { /* Engaged player is in room */
          let game_id = Math.floor(1 + Math.random() * 0x100000).toString(16);

          response = {
            result: 'success',
            game_id: game_id,
            socket_id: requested_user
          };

          socket.emit('game_start_response', response);
          socket.to(requested_user).emit('game_start_response', response);
          serverLog('game_start command succeeded', JSON.stringify(response));
      };
    });
  });

  socket.on('disconnect', () => {
      serverLog('a page disconnected from the server: '+socket.id);

      if ((typeof players[socket.id] != 'undefined') && (players[socket.id] != null)) {
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
    };

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
    };

    /* Error-checking username */
    if ((typeof username == 'undefined') || (username === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid username as a message source';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    };

    /* Error-checking message */
    if ((typeof message == 'undefined') || (message === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a valid message';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    };

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

  socket.on('play_token', (payload) => {
    serverLog('Server received a command', '\'play_token\'', JSON.stringify(payload));

    /* Error-checking payload */
    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'client did not send a payload';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    };

    let player = players[socket.id];
    /* Error-checking player */
    if ((typeof player == 'undefined') || (player === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'play_token came from unregistered player';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    };

    let username = player.username;
    /* Error-checking username */
    if ((typeof username == 'undefined') || (username === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'play_token came from unregistered username';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    };

    let game_id = player.room;
    /* Error-checking room */
    if ((typeof game_id == 'undefined') || (game_id === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'no valid game associated with play_token';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    };

    let row = payload.row;
    /* Error-checking row */
    if ((typeof row == 'undefined') || (row === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'no valid row associated with play_token';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    };

    let column = payload.column;
    /* Error-checking column */
    if ((typeof column == 'undefined') || (column === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'no valid column associated with play_token';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    };

    let color = payload.color;
    /* Error-checking column */
    if ((typeof color == 'undefined') || (color === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'no valid color associated with play_token';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    };

    let game = games[game_id];
    /* Error-checking column */
    if ((typeof game == 'undefined') || (game === null)) {
      response = {};
      response.result = 'fail';
      response.message = 'no valid game associated with play_token';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    };

    /* If data from client is good, handle the command */
    let response = {
      result: 'success'
    };
    socket.emit('play_token_response', response);

    /* Execute the move */
    if (color === 'white') {
      game.board[row][column] = 'w';
      game.whose_turn = 'black';
    }
    else if (color === 'black') {
      game.board[row][column] = 'b';
      game.whose_turn = 'white';
    };

    send_game_update(socket, game_id, 'played a token');
  });
});


/*******************************/
/* Code relateed to game state */

let games = [];

function create_new_game () {
  let new_game = {};
  new_game.player_white = {};
  new_game.player_white.socket = "";
  new_game.player_white.username = "";
  new_game.player_black = {};
  new_game.player_black.socket = "";
  new_game.player_black.username = "";

  var d = new Date();
  new_game.last_move_time = d.getTime();

  new_game.whose_turn = 'white';

  new_game.board = [
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], /* row 1 */
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], /* row 2 */
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], /* row 3 */
    [' ', ' ', ' ', 'w', 'b', ' ', ' ', ' '], /* row 4 */
    [' ', ' ', ' ', 'b', 'w', ' ', ' ', ' '], /* row 5 */
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], /* row 6 */
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '], /* row 7 */
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '] /* row 8 */
  ];

  return new_game;
};

function send_game_update(socket, game_id, message) {
  /* Check if game with game_id exists */
  if ((typeof games[game_id] == 'undefined') || (games[game_id] == 'undefined' === null)) {
    console.log('No game exists with game_id:' + game_id + '. Making a new game for ' + socket.id);
    games[game_id] = create_new_game();
  };

  /* Make sure only 2 people in room */

  /* Assign this socket a color */
  io.of('/').to(game_id).allSockets().then((sockets) => {
    const iterator = sockets[Symbol.iterator]();

    if (sockets.size >= 1) {
      let first = iterator.next().value;
      if ((games[game_id].player_white.socket != first) && (games[game_id].player_black.socket != first)) {
        /* 1st Player does not have a color */
        if (games[game_id].player_white.socket === "") {
          /* Player should be white */
          console.log('White is assigned to: ' + first);
          games[game_id].player_white.socket = first;
          games[game_id].player_white.username = players[first].username;
        }
        else if (games[game_id].player_black.socket === "") {
          /* Player should be black */
          console.log('Black is assigned to: ' + first);
          games[game_id].player_black.socket = first;
          games[game_id].player_black.username = players[first].username;
        }
        else {
          /* Player should be kicked */
          console.log('Kicking ' + first + 'out of game: ' + game_id);
          io.in(first).socketsLeave([game_id]);
        };
      };
    };

    if (sockets.size >= 2) {
      let second = iterator.next().value;
      if ((games[game_id].player_white.socket != second) && (games[game_id].player_black.socket != second)) {
        /* 2nd Player does not have a color */
        if (games[game_id].player_white.socket === "") {
          /* Player should be white */
          console.log('White is assigned to: ' + second);
          games[game_id].player_white.socket = second;
          games[game_id].player_white.username = players[second].username;
        }
        else if (games[game_id].player_black.socket === "") {
          /* Player should be black */
          console.log('Black is assigned to: ' + second);
          games[game_id].player_black.socket = second;
          games[game_id].player_black.username = players[second].username;
        }
        else {
          /* Player should be kicked */
          console.log('Kicking ' + second + 'out of game: ' + game_id);
          io.in(second).socketsLeave([game_id]);
        };
      };
    };

    /* Send game update */
    let payload = {
      result: 'success',
      game_id: game_id,
      game: games[game_id],
      message: message
    };
    io.of('/').to(game_id).emit('game_update', payload);
  });

  /* Check if game is over */
  let count = 0;
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      if (games[game_id].board[row][column] != ' ') {
        count++;
      };
    };
  };

  if (count === 64) {
    let payload = {
      result: 'success',
      game_id: game_id,
      game: games[game_id],
      who_won: 'everyone'
    };
    io.in(game_id).emit('game_over', payload);

    /* Delete old games after one hour */
    setTimeout(
      ((id) => {
        return (() => {
          delete games[id];
        });
      }) (game_id), 60 * 60 * 1000
    );
  };
};
