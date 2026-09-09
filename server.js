const express = require("express");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

let db = {
  users: [],
  reports: []
};

try {
  if (fs.existsSync(DATA_FILE)) {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    if (saved && Array.isArray(saved.users)) {
      db.users = saved.users;
    }

    if (saved && Array.isArray(saved.reports)) {
      db.reports = saved.reports;
    }
  }
} catch (err) {
  console.log("data.json could not be loaded:", err.message);
}

function save() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2),
      "utf8"
    );
    return true;
  } catch (err) {
    console.log("Database save error:", err.message);
    return false;
  }
}

function clean(value, max = 100) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    gender: user.gender,
    city: user.city,
    photo: user.photo || "",
    online: online.has(user.id)
  };
}

function findUser(username) {
  return db.users.find(
    user => user.username === username
  );
}

function getAuthToken(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return "";
  }

  return header.slice(7);
}

function auth(req) {
  const t = getAuthToken(req);

  if (!t) return null;

  return sessions.get(t) || null;
}

function hashPassword(password, salt) {
  return crypto
    .scryptSync(password, salt, 64)
    .toString("hex");
}

function makePassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  return (
    hashPassword(password, salt) +
    ":" +
    salt
  );
}

function verifyPassword(password, stored) {
  try {
    const parts = String(stored || "").split(":");

    if (parts.length !== 2) {
      return false;
    }

    const hash = parts[0];
    const salt = parts[1];

    const test = hashPassword(password, salt);

    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(test, "hex");

    if (a.length !== b.length) {
      return false;
    }

    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

function createToken() {
  return crypto.randomBytes(32).toString("hex");
}

const sessions = new Map();
const sockets = new Map();
const online = new Map();
const waiting = new Map();
const rooms = new Map();

function onlineUsers() {
  return [...online.keys()]
    .map(id => {
      const user = db.users.find(
        u => u.id === id
      );

      return publicUser(user);
    })
    .filter(Boolean);
}

function emitOnline() {
  io.emit(
    "online_users",
    onlineUsers()
  );
}

function removeWaiting(id) {
  waiting.delete(id);
}

/* =========================
   REGISTER
========================= */

app.post("/api/register", (req, res) => {
  try {
    const username = clean(
      req.body.username,
      24
    ).toLowerCase();

    const password = String(
      req.body.password || ""
    );

    const name = clean(
      req.body.name,
      40
    );

    const gender = clean(
      req.body.gender,
      10
    );

    const city = clean(
      req.body.city,
      50
    );

    const photo = String(
      req.body.photo || ""
    ).slice(0, 700000);

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({
        error:
          "نام کاربری باید ۳ تا ۲۴ کاراکتر انگلیسی، عدد یا _ باشد."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error:
          "رمز عبور باید حداقل ۶ کاراکتر باشد."
      });
    }

    if (!name) {
      return res.status(400).json({
        error: "نام را وارد کنید."
      });
    }

    if (!city) {
      return res.status(400).json({
        error: "شهر را وارد کنید."
      });
    }

    if (!["male", "female"].includes(gender)) {
      return res.status(400).json({
        error: "جنسیت را انتخاب کنید."
      });
    }

    if (findUser(username)) {
      return res.status(409).json({
        error:
          "این نام کاربری قبلاً ثبت شده است."
      });
    }

    const id =
      Date.now() +
      Math.floor(Math.random() * 10000);

    const user = {
      id,
      username,
      password_hash: makePassword(password),
      name,
      gender,
      city,
      photo,
      createdAt: new Date().toISOString()
    };

    db.users.push(user);

    if (!save()) {
      db.users.pop();

      return res.status(500).json({
        error:
          "ذخیره حساب انجام نشد. دوباره تلاش کنید."
      });
    }

    const t = createToken();

    sessions.set(t, id);

    return res.json({
      ok: true,
      token: t,
      user: publicUser(user)
    });

  } catch (err) {
    console.log("REGISTER ERROR:", err);

    return res.status(500).json({
      error:
        "خطای سرور هنگام ثبت‌نام."
    });
  }
});

/* =========================
   LOGIN
========================= */

app.post("/api/login", (req, res) => {
  try {
    const username = clean(
      req.body.username,
      24
    ).toLowerCase();

    const password = String(
      req.body.password || ""
    );

    const user = findUser(username);

    if (
      !user ||
      !verifyPassword(
        password,
        user.password_hash
      )
    ) {
      return res.status(401).json({
        error:
          "نام کاربری یا رمز عبور اشتباه است."
      });
    }

    const t = createToken();

    sessions.set(t, user.id);

    return res.json({
      ok: true,
      token: t,
      user: publicUser(user)
    });

  } catch (err) {
    console.log("LOGIN ERROR:", err);

    return res.status(500).json({
      error: "خطای سرور هنگام ورود."
    });
  }
});

/* =========================
   LOGOUT
========================= */

app.post("/api/logout", (req, res) => {
  const t = getAuthToken(req);
  const id = sessions.get(t);

  if (id) {
    removeWaiting(id);
    online.delete(id);
  }

  sessions.delete(t);

  emitOnline();

  res.json({
    ok: true
  });
});

/* =========================
   CURRENT USER
========================= */

app.get("/api/me", (req, res) => {
  const id = auth(req);

  if (!id) {
    return res.status(401).json({
      error:
        "وارد حساب نشده‌اید."
    });
  }

  const user = db.users.find(
    u => u.id === id
  );

  if (!user) {
    return res.status(404).json({
      error:
        "کاربر پیدا نشد."
    });
  }

  res.json({
    user: publicUser(user)
  });
});

/* =========================
   PROFILE
========================= */

app.put("/api/profile", (req, res) => {
  const id = auth(req);

  if (!id) {
    return res.status(401).json({
      error:
        "وارد حساب شوید."
    });
  }

  const user = db.users.find(
    u => u.id === id
  );

  if (!user) {
    return res.status(404).json({
      error:
        "کاربر پیدا نشد."
    });
  }

  const name = clean(
    req.body.name,
    40
  );

  const city = clean(
    req.body.city,
    50
  );

  const gender = clean(
    req.body.gender,
    10
  );

  const photo = String(
    req.body.photo || ""
  ).slice(0, 700000);

  if (!name || !city) {
    return res.status(400).json({
      error:
        "نام و شهر را کامل وارد کنید."
    });
  }

  if (!["male", "female"].includes(gender)) {
    return res.status(400).json({
      error:
        "جنسیت نامعتبر است."
    });
  }

  user.name = name;
  user.city = city;
  user.gender = gender;
  user.photo = photo;

  save();

  res.json({
    ok: true,
    user: publicUser(user)
  });
});

/* =========================
   REPORT
========================= */

app.post("/api/report", (req, res) => {
  const id = auth(req);

  if (!id) {
    return res.status(401).json({
      error:
        "وارد حساب شوید."
    });
  }

  const reportedId =
    Number(req.body.reportedId);

  const reason = clean(
    req.body.reason,
    300
  );

  if (
    !reportedId ||
    reportedId === id ||
    !reason
  ) {
    return res.status(400).json({
      error:
        "گزارش نامعتبر است."
    });
  }

  db.reports.push({
    id: Date.now(),
    reporterId: id,
    reportedId,
    reason,
    createdAt:
      new Date().toISOString()
  });

  save();

  res.json({
    ok: true
  });
});

/* =========================
   SOCKET.IO
========================= */

io.on("connection", socket => {

  socket.on("login", data => {
    try {
      const t =
        data &&
        String(data.token || "");

      const id = sessions.get(t);

      const user = db.users.find(
        u => u.id === id
      );

      if (!id || !user) {
        socket.emit(
          "auth_error",
          "نشست شما معتبر نیست. دوباره وارد شوید."
        );
        return;
      }

      sockets.set(
        socket.id,
        id
      );

      online.set(
        id,
        socket.id
      );

      socket.emit(
        "profile",
        publicUser(user)
      );

      emitOnline();

    } catch (err) {
      console.log(
        "SOCKET LOGIN ERROR:",
        err
      );
    }
  });

  socket.on("find", data => {
    const meId =
      sockets.get(socket.id);

    const me = db.users.find(
      u => u.id === meId
    );

    if (!me) {
      socket.emit(
        "error_msg",
        "ابتدا وارد شوید."
      );
      return;
    }

    const lookingFor =
      data &&
      data.lookingFor;

    if (
      !["male", "female", "any"]
        .includes(lookingFor)
    ) {
      socket.emit(
        "error_msg",
        "انتخاب جنسیت نامعتبر است."
      );
      return;
    }

    removeWaiting(meId);

    for (
      const [otherId, wanted]
      of waiting
    ) {

      const other =
        db.users.find(
          u => u.id === otherId
        );

      if (
        !other ||
        !online.has(otherId)
      ) {
        waiting.delete(otherId);
        continue;
      }

      if (
        wanted !== "any" &&
        wanted !== me.gender
      ) {
        continue;
      }

      if (
        lookingFor !== "any" &&
        other.gender !== lookingFor
      ) {
        continue;
      }

      const otherSocketId =
        online.get(otherId);

      const otherSocket =
        io.sockets.sockets.get(
          otherSocketId
        );

      if (!otherSocket) {
        waiting.delete(otherId);
        continue;
      }

      waiting.delete(otherId);

      const room =
        "chat_" +
        Math.min(meId, otherId) +
        "_" +
        Math.max(meId, otherId);

      rooms.set(
        meId,
        room
      );

      rooms.set(
        otherId,
        room
      );

      socket.join(room);
      otherSocket.join(room);

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
  });

  socket.on("message", data => {
    const meId =
      sockets.get(socket.id);

    const requestedRoom =
      data &&
      data.room;

    const text =
      data &&
      data.text;

    if (
      !meId ||
      !requestedRoom ||
      rooms.get(meId) !== requestedRoom
    ) {
      return;
    }

    const cleanText =
      clean(text, 2000);

    if (!cleanText) return;

    io.to(requestedRoom).emit(
      "message",
      {
        text: cleanText,
        time:
          new Date().toLocaleTimeString(
            "fa-IR",
            {
              hour: "2-digit",
              minute: "2-digit"
            }
          )
      }
    );
  });

  socket.on("next", () => {
    const id =
      sockets.get(socket.id);

    if (!id) return;

    removeWaiting(id);

    const room =
      rooms.get(id);

    if (room) {
      socket.leave(room);
    }

    rooms.delete(id);

    socket.emit(
      "left_chat"
    );
  });

  socket.on("report", data => {
    const id =
      sockets.get(socket.id);

    const reportedId =
      Number(
        data &&
        data.reportedId
      );

    const reason =
      clean(
        data &&
        data.reason,
        300
      );

    if (
      !id ||
      !reportedId ||
      reportedId === id ||
      !reason
    ) {
      return;
    }

    db.reports.push({
      id: Date.now(),
      reporterId: id,
      reportedId,
      reason,
      createdAt:
        new Date().toISOString()
    });

    save();

    socket.emit(
      "reported",
      "گزارش ثبت شد."
    );
  });

  socket.on("disconnect", () => {
    const id =
      sockets.get(socket.id);

    if (id) {
      removeWaiting(id);

      if (
        online.get(id) ===
        socket.id
      ) {
        online.delete(id);
      }

      rooms.delete(id);

      emitOnline();
    }

    sockets.delete(
      socket.id
    );
  });
});

/* =========================
   START SERVER
========================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Chatogram running on port ${PORT}`
    );
  }
);
