"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT =
  Number(process.env.PORT) || 3000;

const DATA_FILE =
  path.join(__dirname, "data.json");


/* ---------------- MIDDLEWARE ---------------- */

app.use(
  cors({
    origin: "*"
  })
);

app.use(
  express.json({
    limit: "8mb"
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);


/* ---------------- DATABASE ---------------- */

let db = {
  reports: []
};

try {

  if (fs.existsSync(DATA_FILE)) {

    const data =
      JSON.parse(
        fs.readFileSync(
          DATA_FILE,
          "utf8"
        )
      );

    if (data && typeof data === "object") {
      db = data;
    }

  }

} catch (error) {

  console.log(
    "Database load error:",
    error.message
  );

}


if (!Array.isArray(db.reports)) {
  db.reports = [];
}


function save() {

  try {

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        db,
        null,
        2
      ),
      "utf8"
    );

  } catch (error) {

    console.log(
      "Database save error:",
      error.message
    );

  }

}


/* ---------------- HELPERS ---------------- */

function clean(value, max = 100) {

  return String(
    value ?? ""
  )
    .trim()
    .slice(0, max);

}


function makeId() {

  return (
    "guest_" +
    Date.now() +
    "_" +
    crypto
      .randomBytes(5)
      .toString("hex")
  );

}


function publicUser(user) {

  if (!user) return null;

  return {

    id: user.id,

    username:
      user.username || "guest",

    name:
      user.name || "کاربر مهمان",

    gender:
      user.gender === "female"
        ? "female"
        : "male",

    city:
      user.city || "ایران",

    photo:
      user.photo || "",

    online:
      online.has(user.id)

  };

}


/* ---------------- ONLINE ---------------- */

const sockets = new Map();

const online = new Map();

const waiting = new Map();

const rooms = new Map();

const profiles = new Map();


function emitOnline() {

  const users = [];

  for (const id of online.keys()) {

    const user =
      profiles.get(id);

    if (user) {

      users.push(
        publicUser(user)
      );

    }

  }

  io.emit(
    "online_users",
    users
  );

}


function removeWaiting(id) {

  waiting.delete(id);

}


/* ---------------- HOME ---------------- */

app.get(
  "/",
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );

  }
);


/* ---------------- HEALTH ---------------- */

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      ok: true,
      service: "Chatogram",
      online: online.size
    });

  }
);


/* ---------------- SOCKET ---------------- */

io.on(
  "connection",
  socket => {

    console.log(
      "New connection:",
      socket.id
    );


    /* GUEST LOGIN */

    socket.on(
      "guest_login",
      data => {

        let profile =
          data?.profile || {};

        const id =
          clean(
            profile.id,
            100
          ) || makeId();


        const user = {

          id,

          username:
            "guest_" +
            id.slice(-8),

          name:
            clean(
              profile.name,
              40
            ) ||
            "کاربر مهمان",

          gender:
            profile.gender === "female"
              ? "female"
              : "male",

          city:
            clean(
              profile.city,
              50
            ) ||
            "ایران",

          photo:
            String(
              profile.photo || ""
            ).slice(
              0,
              700000
            )

        };


        profiles.set(
          id,
          user
        );

        sockets.set(
          socket.id,
          id
        );

        online.set(
          id,
          socket.id
        );


        socket.emit(
          "guest_profile",
          publicUser(user)
        );


        emitOnline();

      }
    );


    /* FIND */

    socket.on(
      "find",
      data => {

        const meId =
          sockets.get(
            socket.id
          );

        const me =
          profiles.get(
            meId
          );


        if (!me) {

          socket.emit(
            "error_msg",
            "اتصال شما هنوز آماده نیست."
          );

          return;
        }


        const lookingFor =
          clean(
            data?.lookingFor,
            10
          );


        if (
          ![
            "male",
            "female",
            "any"
          ].includes(
            lookingFor
          )
        ) {

          return;

        }


        removeWaiting(meId);


        for (
          const [
            otherId,
            wanted
          ] of waiting
        ) {

          if (
            otherId === meId
          ) {
            continue;
          }


          const other =
            profiles.get(
              otherId
            );


          if (
            !other ||
            !online.has(otherId)
          ) {

            waiting.delete(
              otherId
            );

            continue;

          }


          /*
            خواسته فرد مقابل
          */

          if (
            wanted !== "any" &&
            wanted !== me.gender
          ) {

            continue;

          }


          /*
            خواسته کاربر فعلی
          */

          if (
            lookingFor !== "any" &&
            other.gender !== lookingFor
          ) {

            continue;

          }


          const otherSocketId =
            online.get(
              otherId
            );


          const otherSocket =
            io.sockets.sockets.get(
              otherSocketId
            );


          if (!otherSocket) {

            waiting.delete(
              otherId
            );

            continue;

          }


          waiting.delete(
            otherId
          );


          const room =
            "chat_" +
            crypto
              .randomBytes(12)
              .toString("hex");


          rooms.set(
            meId,
            room
          );

          rooms.set(
            otherId,
            room
          );


          socket.join(
            room
          );

          otherSocket.join(
            room
          );


          socket.emit(
            "matched",
            {
              room,
              partner:
                publicUser(other)
            }
          );


          otherSocket.emit(
            "matched",
            {
              room,
              partner:
                publicUser(me)
            }
          );


          return;

        }


        waiting.set(
          meId,
          lookingFor
        );


        socket.emit(
          "searching"
        );

      }
    );


    /* MESSAGE */

    socket.on(
      "message",
      data => {

        const meId =
          sockets.get(
            socket.id
          );


        if (!meId) return;


        const room =
          clean(
            data?.room,
            200
          );


        const text =
          clean(
            data?.text,
            2000
          );


        if (!room || !text) {
          return;
        }


        if (
          rooms.get(
            meId
          ) !== room
        ) {

          return;

        }


        io.to(room).emit(
          "message",
          {

            text,

            time:
              new Date()
                .toLocaleTimeString(
                  "fa-IR",
                  {
                    hour:
                      "2-digit",

                    minute:
                      "2-digit"
                  }
                )

          }
        );

      }
    );


    /* NEXT */

    socket.on(
      "next",
      () => {

        const id =
          sockets.get(
            socket.id
          );


        if (!id) return;


        removeWaiting(id);


        const room =
          rooms.get(id);


        if (room) {

          socket.leave(
            room
          );

        }


        rooms.delete(id);


        socket.emit(
          "left_chat"
        );

      }
    );


    /* REPORT */

    socket.on(
      "report",
      data => {

        const reporterId =
          sockets.get(
            socket.id
          );


        const reportedId =
          clean(
            data?.reportedId,
            100
          );


        const reason =
          clean(
            data?.reason,
            300
          );


        if (
          !reporterId ||
          !reportedId ||
          reporterId === reportedId ||
          !reason
        ) {

          return;

        }


        db.reports.push({

          id:
            Date.now(),

          reporterId,

          reportedId,

          reason,

          createdAt:
            new Date()
              .toISOString()

        });


        save();


        socket.emit(
          "reported",
          "گزارش با موفقیت ثبت شد."
        );

      }
    );


    /* DISCONNECT */

    socket.on(
      "disconnect",
      () => {

        const id =
          sockets.get(
            socket.id
          );


        if (id) {

          removeWaiting(
            id
          );


          if (
            online.get(id) ===
            socket.id
          ) {

            online.delete(
              id
            );

          }


          rooms.delete(
            id
          );


          emitOnline();

        }


        sockets.delete(
          socket.id
        );


        console.log(
          "Disconnected:",
          socket.id
        );

      }
    );

  }
);


/* ---------------- START ---------------- */

server.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "Chatogram running on port " +
      PORT
    );

  }
);