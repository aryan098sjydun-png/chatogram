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

const PORT = Number(process.env.PORT) || 3000;

const DATA_FILE = path.join(__dirname, "data.json");

/* =========================
   MIDDLEWARE
========================= */

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

/* =========================
   DATABASE
========================= */

let db = {
  reports: []
};

try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, "utf8");

    if (raw.trim()) {
      const parsed = JSON.parse(raw);

      if (
        parsed &&
        typeof parsed === "object"
      ) {
        db = parsed;
      }
    }
  }
} catch (err) {
  console.log(
    "Database load error:",
    err.message
  );
}

if (!Array.isArray(db.reports)) {
  db.reports = [];
}

function saveDatabase() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2),
      "utf8"
    );
  } catch (err) {
    console.log(
      "Database save error:",
      err.message
    );
  }
}

/* =========================
   HELPERS
========================= */

function clean(value, max = 100) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function makeGuestId() {
  return (
    "guest_" +
    Date.now() +
    "_" +
    crypto
      .randomBytes(6)
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

/* =========================
   MEMORY
========================= */

const sockets = new Map();

/*
  socket.id -> user.id
*/

const online = new Map();

/*
  user.id -> socket.id
*/

const profiles = new Map();

/*
  user.id -> profile
*/

const waiting = new Map();

/*
  user.id -> lookingFor
*/

const rooms = new Map();

/*
  user.id -> room
*/

/* =========================
   ONLINE USERS
========================= */

function emitOnlineUsers() {
  const users = [];

  for (const userId of online.keys()) {
    const user = profiles.get(userId);

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

/* =========================
   REMOVE FROM WAITING
========================= */

function removeWaiting(userId) {
  waiting.delete(userId);
}

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

/* =========================
   HEALTH CHECK
========================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      service: "Chatogram",
      online: online.size,
      waiting: waiting.size
    });
  }
);

/* =========================
   SOCKET.IO
========================= */

io.on(
  "connection",
  (socket) => {
    console.log(
      "Connected:",
      socket.id
    );

    /* =====================
       GUEST LOGIN
    ===================== */

    socket.on(
      "guest_login",
      (data = {}) => {
        try {
          const profile =
            data.profile || {};

          let id = clean(
            profile.id,
            100
          );

          if (!id) {
            id = makeGuestId();
          }

          /*
            اگر همین کاربر قبلاً
            وصل بوده، اتصال قبلی
            حذف شود.
          */

          const oldSocketId =
            online.get(id);

          if (
            oldSocketId &&
            oldSocketId !== socket.id
          ) {
            const oldSocket =
              io.sockets.sockets.get(
                oldSocketId
              );

            if (oldSocket) {
              oldSocket.disconnect(
                true
              );
            }
          }

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
              profile.gender ===
              "female"
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

          emitOnlineUsers();

          console.log(
            "Guest login:",
            id
          );
        } catch (err) {
          console.log(
            "Guest login error:",
            err.message
          );

          socket.emit(
            "error_msg",
            "ورود مهمان انجام نشد."
          );
        }
      }
    );

    /* =====================
       FIND PARTNER
    ===================== */

    socket.on(
      "find",
      (data = {}) => {
        const myId =
          sockets.get(
            socket.id
          );

        if (!myId) {
          socket.emit(
            "error_msg",
            "ابتدا وارد برنامه شوید."
          );

          return;
        }

        const me =
          profiles.get(myId);

        if (!me) {
          socket.emit(
            "error_msg",
            "پروفایل شما پیدا نشد."
          );

          return;
        }

        let lookingFor =
          clean(
            data.lookingFor,
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
          lookingFor = "any";
        }

        /*
          اگر قبلاً داخل چت بوده
        */

        const oldRoom =
          rooms.get(myId);

        if (oldRoom) {
          socket.leave(
            oldRoom
          );

          rooms.delete(
            myId
          );
        }

        removeWaiting(
          myId
        );

        /*
          دنبال یک نفر بگرد
        */

        for (
          const [
            otherId,
            otherLookingFor
          ] of waiting
        ) {
          if (
            otherId === myId
          ) {
            continue;
          }

          const other =
            profiles.get(
              otherId
            );

          if (!other) {
            waiting.delete(
              otherId
            );

            continue;
          }

          if (
            !online.has(
              otherId
            )
          ) {
            waiting.delete(
              otherId
            );

            continue;
          }

          /*
            آیا جنسیت من
            مورد قبول طرف مقابل است؟
          */

          const otherAcceptsMe =
            otherLookingFor ===
              "any" ||
            otherLookingFor ===
              me.gender;

          /*
            آیا جنسیت طرف مقابل
            مورد قبول من است؟
          */

          const iAcceptOther =
            lookingFor ===
              "any" ||
            lookingFor ===
              other.gender;

          if (
            !otherAcceptsMe ||
            !iAcceptOther
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

          /*
            پیدا شد
          */

          waiting.delete(
            otherId
          );

          const roomId =
            "chat_" +
            crypto
              .randomBytes(16)
              .toString("hex");

          rooms.set(
            myId,
            roomId
          );

          rooms.set(
            otherId,
            roomId
          );

          socket.join(
            roomId
          );

          otherSocket.join(
            roomId
          );

          socket.emit(
            "matched",
            {
              room: roomId,

              partner:
                publicUser(other)
            }
          );

          otherSocket.emit(
            "matched",
            {
              room: roomId,

              partner:
                publicUser(me)
            }
          );

          console.log(
            "Matched:",
            myId,
            "<->",
            otherId
          );

          return;
        }

        /*
          اگر کسی پیدا نشد
        */

        waiting.set(
          myId,
          lookingFor
        );

        socket.emit(
          "searching"
        );

        console.log(
          "Waiting:",
          myId,
          lookingFor
        );
      }
    );

    /* =====================
       SEND MESSAGE
    ===================== */

    socket.on(
      "message",
      (data = {}) => {
        const myId =
          sockets.get(
            socket.id
          );

        if (!myId) {
          return;
        }

        const roomId =
          clean(
            data.room,
            200
          );

        const text =
          clean(
            data.text,
            2000
          );

        if (
          !roomId ||
          !text
        ) {
          return;
        }

        /*
          امنیت:
          کاربر باید واقعاً
          عضو همین اتاق باشد.
        */

        if (
          rooms.get(
            myId
          ) !== roomId
        ) {
          return;
        }

        const partnerId =
          [...rooms.entries()]
            .find(
              ([id, room]) =>
                room === roomId &&
                id !== myId
            )?.[0] || null;

        const message = {
          id:
            crypto
              .randomBytes(8)
              .toString("hex"),

          text,

          senderId:
            myId,

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
        };

        /*
          پیام واقعی به هر دو طرف
        */

        io.to(roomId).emit(
          "message",
          message
        );

        console.log(
          "Message:",
          myId,
          "->",
          partnerId,
          text
        );
      }
    );

    /* =====================
       NEXT
    ===================== */

    socket.on(
      "next",
      () => {
        const myId =
          sockets.get(
            socket.id
          );

        if (!myId) {
          return;
        }

        removeWaiting(
          myId
        );

        const roomId =
          rooms.get(myId);

        if (roomId) {
          socket.leave(
            roomId
          );

          /*
            طرف مقابل هم از چت خارج شود
          */

          for (
            const [
              userId,
              userRoom
            ] of rooms
          ) {
            if (
              userRoom ===
                roomId &&
              userId !== myId
            ) {
              const partnerSocketId =
                online.get(
                  userId
                );

              const partnerSocket =
                io.sockets.sockets.get(
                  partnerSocketId
                );

              if (
                partnerSocket
              ) {
                partnerSocket.leave(
                  roomId
                );

                partnerSocket.emit(
                  "partner_left"
                );
              }

              rooms.delete(
                userId
              );
            }
          }

          rooms.delete(
            myId
          );
        }

        socket.emit(
          "left_chat"
        );
      }
    );

    /* =====================
       REPORT
    ===================== */

    socket.on(
      "report",
      (data = {}) => {
        const reporterId =
          sockets.get(
            socket.id
          );

        const reportedId =
          clean(
            data.reportedId,
            100
          );

        const reason =
          clean(
            data.reason,
            300
          );

        if (
          !reporterId ||
          !reportedId ||
          reporterId ===
            reportedId ||
          !reason
        ) {
          socket.emit(
            "error_msg",
            "اطلاعات گزارش کامل نیست."
          );

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

        saveDatabase();

        socket.emit(
          "reported",
          "گزارش با موفقیت ثبت شد."
        );
      }
    );

    /* =====================
       DISCONNECT
    ===================== */

    socket.on(
      "disconnect",
      () => {
        const myId =
          sockets.get(
            socket.id
          );

        if (!myId) {
          return;
        }

        console.log(
          "Disconnected:",
          myId
        );

        removeWaiting(
          myId
        );

        const roomId =
          rooms.get(myId);

        if (roomId) {
          /*
            اطلاع به طرف مقابل
          */

          for (
            const [
              userId,
              userRoom
            ] of rooms
          ) {
            if (
              userRoom ===
                roomId &&
              userId !== myId
            ) {
              const partnerSocketId =
                online.get(
                  userId
                );

              const partnerSocket =
                io.sockets.sockets.get(
                  partnerSocketId
                );

              if (
                partnerSocket
              ) {
                partnerSocket.leave(
                  roomId
                );

                partnerSocket.emit(
                  "partner_left"
                );
              }

              rooms.delete(
                userId
              );
            }
          }

          rooms.delete(
            myId
          );
        }

        /*
          فقط اگر این socket
          اتصال فعلی کاربر است
        */

        if (
          online.get(myId) ===
          socket.id
        ) {
          online.delete(
            myId
          );
        }

        sockets.delete(
          socket.id
        );

        emitOnlineUsers();
      }
    );
  }
);

/* =========================
   START SERVER
========================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "================================"
    );

    console.log(
      "Chatogram server started"
    );

    console.log(
      "Port:",
      PORT
    );

    console.log(
      "Guest mode: ENABLED"
    );

    console.log(
      "Real-time chat: ENABLED"
    );

    console.log(
      "================================"
    );
  }
);