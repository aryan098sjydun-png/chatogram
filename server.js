const express = require("express");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "public")));

let db = { users: [], reports: [] };
try {
  if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
} catch (_) {}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
}
function clean(v, max = 100) {
  return String(v ?? "").trim().slice(0, max);
}
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, name: u.name,
    gender: u.gender, city: u.city, photo: u.photo || "",
    online: online.has(u.id)
  };
}
function findUser(username) {
  return db.users.find(u => u.username === username);
}
function auth(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  return sessions.get(token) || null;
}
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function makePassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${hashPassword(password, salt)}:${salt}`;
}
function verifyPassword(password, stored) {
  const [hash, salt] = String(stored || "").split(":");
  if (!hash || !salt) return false;
  const test = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
}
function token() {
  return crypto.randomBytes(32).toString("hex");
}

const sessions = new Map();       // token -> user id
const sockets = new Map();        // socket id -> user id
const online = new Map();         // user id -> socket id
const waiting = new Map();        // user id -> gender wanted
const rooms = new Map();          // user id -> room

function onlineUsers() {
  return [...online.keys()].map(id => publicUser(db.users.find(u => u.id === id))).filter(Boolean);
}
function emitOnline() {
  io.emit("online_users", onlineUsers());
}
function removeWaiting(id) {
  waiting.delete(id);
}

app.post("/api/register", (req, res) => {
  const username = clean(req.body.username, 24).toLowerCase();
  const password = String(req.body.password || "");
  const name = clean(req.body.name, 40);
  const gender = clean(req.body.gender, 10);
  const city = clean(req.body.city, 50);
  const photo = String(req.body.photo || "").slice(0, 700000);

  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username))
    return res.status(400).json({error:"نام کاربری باید ۳ تا ۲۴ کاراکتر انگلیسی، عدد یا _ باشد."});
  if (password.length < 6)
    return res.status(400).json({error:"رمز عبور باید حداقل ۶ کاراکتر باشد."});
  if (!name || !city || !["male","female"].includes(gender))
    return res.status(400).json({error:"نام، جنسیت و شهر را کامل وارد کنید."});
  if (findUser(username))
    return res.status(409).json({error:"این نام کاربری قبلاً ثبت شده است."});

  const id = Date.now() + Math.floor(Math.random() * 10000);
  const user = {
    id, username, password_hash: makePassword(password),
    name, gender, city, photo, createdAt: new Date().toISOString()
  };
  db.users.push(user);
  save();

  const t = token();
  sessions.set(t, id);
  res.json({token:t, user:publicUser(user)});
});

app.post("/api/login", (req, res) => {
  const username = clean(req.body.username, 24).toLowerCase();
  const password = String(req.body.password || "");
  const u = findUser(username);
  if (!u || !verifyPassword(password, u.password_hash))
    return res.status(401).json({error:"نام کاربری یا رمز عبور اشتباه است."});

  const t = token();
  sessions.set(t, u.id);
  res.json({token:t, user:publicUser(u)});
});

app.post("/api/logout", (req, res) => {
  const h = req.headers.authorization || "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  const id = sessions.get(t);
  if (id) {
    removeWaiting(id);
    online.delete(id);
  }
  sessions.delete(t);
  emitOnline();
  res.json({ok:true});
});

app.get("/api/me", (req, res) => {
  const id = auth(req);
  if (!id) return res.status(401).json({error:"وارد حساب نشده‌اید."});
  res.json({user:publicUser(db.users.find(u => u.id === id))});
});

app.put("/api/profile", (req, res) => {
  const id = auth(req);
  if (!id) return res.status(401).json({error:"وارد حساب شوید."});
  const u = db.users.find(x => x.id === id);
  if (!u) return res.status(404).json({error:"کاربر پیدا نشد."});

  const name = clean(req.body.name, 40);
  const city = clean(req.body.city, 50);
  const gender = clean(req.body.gender, 10);
  const photo = String(req.body.photo || "").slice(0, 700000);
  if (!name || !city || !["male","female"].includes(gender))
    return res.status(400).json({error:"اطلاعات پروفایل ناقص است."});

  u.name = name; u.city = city; u.gender = gender; u.photo = photo;
  save();
  res.json({user:publicUser(u)});
});

app.post("/api/report", (req, res) => {
  const id = auth(req);
  if (!id) return res.status(401).json({error:"وارد حساب شوید."});
  const reportedId = Number(req.body.reportedId);
  const reason = clean(req.body.reason, 300);
  if (!reportedId || reportedId === id || !reason)
    return res.status(400).json({error:"گزارش نامعتبر است."});

  db.reports.push({id:Date.now(), reporterId:id, reportedId, reason, createdAt:new Date().toISOString()});
  save();
  res.json({ok:true});
});

io.on("connection", socket => {
  socket.on("login", ({token:t}) => {
    const id = sessions.get(String(t || ""));
    if (!id || !db.users.find(u => u.id === id))
      return socket.emit("auth_error", "نشست شما معتبر نیست. دوباره وارد شوید.");
    sockets.set(socket.id, id);
    online.set(id, socket.id);
    socket.emit("profile", publicUser(db.users.find(u => u.id === id)));
    emitOnline();
  });

  socket.on("find", ({lookingFor}) => {
    const meId = sockets.get(socket.id);
    const me = db.users.find(u => u.id === meId);
    if (!me) return socket.emit("error_msg", "ابتدا وارد شوید.");
    if (!["male","female","any"].includes(lookingFor)) return;

    removeWaiting(meId);
    for (const [otherId, wanted] of waiting) {
      const other = db.users.find(u => u.id === otherId);
      if (!other || !online.has(otherId)) { waiting.delete(otherId); continue; }
      if (wanted !== "any" && wanted !== me.gender) continue;
      if (lookingFor !== "any" && other.gender !== lookingFor) continue;

      const otherSocketId = online.get(otherId);
      const otherSocket = io.sockets.sockets.get(otherSocketId);
      if (!otherSocket) { waiting.delete(otherId); continue; }

      waiting.delete(otherId);
      const room = `chat_${Math.min(meId,otherId)}_${Math.max(meId,otherId)}`;
      rooms.set(meId, room); rooms.set(otherId, room);
      socket.join(room); otherSocket.join(room);

      socket.emit("matched", {room, partner:publicUser(other)});
      otherSocket.emit("matched", {room, partner:publicUser(me)});
      return;
    }
    waiting.set(meId, lookingFor);
    socket.emit("searching");
  });

  socket.on("message", ({room, text}) => {
    const meId = sockets.get(socket.id);
    if (!meId || !room || rooms.get(meId) !== room) return;
    const cleanText = clean(text, 2000);
    if (!cleanText) return;
    io.to(room).emit("message", {
      text: cleanText,
      time: new Date().toLocaleTimeString("fa-IR",{hour:"2-digit",minute:"2-digit"})
    });
  });

  socket.on("next", () => {
    const id = sockets.get(socket.id);
    if (!id) return;
    removeWaiting(id);
    const room = rooms.get(id);
    if (room) socket.leave(room);
    rooms.delete(id);
    socket.emit("left_chat");
  });

  socket.on("report", ({reportedId, reason}) => {
    const id = sockets.get(socket.id);
    const rid = Number(reportedId);
    const r = clean(reason, 300);
    if (!id || !rid || rid === id || !r) return;
    db.reports.push({id:Date.now(), reporterId:id, reportedId:rid, reason:r, createdAt:new Date().toISOString()});
    save();
    socket.emit("reported", "گزارش ثبت شد.");
  });

  socket.on("disconnect", () => {
    const id = sockets.get(socket.id);
    if (id) {
      removeWaiting(id);
      if (online.get(id) === socket.id) online.delete(id);
      emitOnline();
    }
    sockets.delete(socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Chatogram running: http://127.0.0.1:${PORT}`);
});
