"use strict";

/*
  چتوگرام
  نسخه بدون ثبت نام
*/

let me = null;
let partner = null;
let room = null;
let socket = null;

/*
  اگر Frontend روی همان Render باشد:
  const SERVER_URL = "";
  
  اگر Frontend روی GitHub Pages باشد:
  آدرس Render خودت را اینجا بگذار.
*/
const SERVER_URL = "";


/* ---------------- HELPERS ---------------- */

const $ = id => document.getElementById(id);

function toast(message) {
  const box = $("toast");

  if (!box) {
    alert(message);
    return;
  }

  box.textContent = message;
  box.style.display = "block";

  clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(() => {
    box.style.display = "none";
  }, 3000);
}

function show(page) {

  const home = $("homePage");
  const chat = $("chatPage");

  if (home) home.classList.add("hidden");
  if (chat) chat.classList.add("hidden");

  if (page === "homePage" && home) {
    home.classList.remove("hidden");
  }

  if (page === "chatPage" && chat) {
    chat.classList.remove("hidden");
  }
}

function escapeHtml(value) {

  return String(value ?? "").replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );
}

function avatar(image, photo) {

  if (!image) return;

  if (photo) {
    image.src = photo;
    image.style.objectFit = "cover";
  } else {
    image.removeAttribute("src");
    image.style.background =
      "linear-gradient(135deg,#6b54f5,#282f4a)";
  }
}


/* ---------------- GUEST USER ---------------- */

function createGuest() {

  const saved = localStorage.getItem("chatogram_profile");

  if (saved) {

    try {
      me = JSON.parse(saved);

      if (
        me &&
        me.id &&
        me.name &&
        me.gender &&
        me.city
      ) {
        return me;
      }

    } catch (_) {}
  }

  const id =
    "guest_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .slice(2, 9);

  me = {

    id: id,

    username: id,

    name: "کاربر مهمان",

    gender: "male",

    city: "ایران",

    photo: ""

  };

  localStorage.setItem(
    "chatogram_profile",
    JSON.stringify(me)
  );

  return me;
}


/* ---------------- PROFILE ---------------- */

function renderMe() {

  if (!me) return;

  if ($("myName")) {
    $("myName").textContent =
      me.name || "کاربر مهمان";
  }

  if ($("myMeta")) {

    const gender =
      me.gender === "female"
        ? "زن"
        : "مرد";

    $("myMeta").textContent =
      (me.city || "ایران") +
      " • " +
      gender;
  }

  avatar(
    $("myPhoto"),
    me.photo
  );
}


/* ---------------- SOCKET ---------------- */

function connectSocket() {

  if (socket) {

    try {
      socket.disconnect();
    } catch (_) {}

    socket = null;
  }

  const socketOptions = {

    transports: [
      "websocket",
      "polling"
    ]

  };

  /*
    اگر SERVER_URL خالی باشد،
    به همان دامنه وصل می‌شود.
  */

  socket = io(
    SERVER_URL || undefined,
    socketOptions
  );


  socket.on("connect", () => {

    console.log(
      "Connected:",
      socket.id
    );

    socket.emit("guest_login", {
      profile: me
    });

  });


  socket.on("guest_profile", profile => {

    if (!profile) return;

    me = profile;

    localStorage.setItem(
      "chatogram_profile",
      JSON.stringify(me)
    );

    renderMe();

  });


  socket.on("online_users", list => {

    if (!Array.isArray(list)) return;

    if ($("onlineCount")) {
      $("onlineCount").textContent =
        list.length;
    }

    const box = $("onlineList");

    if (!box) return;

    box.innerHTML = "";

    const others = list
      .filter(u => u && u.id !== me?.id)
      .slice(0, 30);

    others.forEach(user => {

      const row =
        document.createElement("div");

      row.className =
        "onlineUser";

      const img =
        document.createElement("img");

      img.className =
        "avatar";

      avatar(
        img,
        user.photo
      );

      const text =
        document.createElement("div");

      const gender =
        user.gender === "female"
          ? "زن"
          : "مرد";

      text.innerHTML =
        "<b>" +
        escapeHtml(
          user.name || "کاربر"
        ) +
        "</b>" +
        "<small>" +
        escapeHtml(
          user.city || "نامشخص"
        ) +
        " • " +
        gender +
        "</small>";

      row.appendChild(img);
      row.appendChild(text);

      box.appendChild(row);

    });

    if (!box.children.length) {

      box.innerHTML = `
        <div class="onlineUser">
          <span style="font-size:30px">😴</span>
          <div>
            <b>هنوز کسی آنلاین نیست</b>
            <small>کمی بعد دوباره امتحان کن</small>
          </div>
        </div>
      `;

    }

  });


  socket.on("searching", () => {

    show("chatPage");

    room = null;
    partner = null;

    $("searching")?.classList.remove(
      "hidden"
    );

    $("messages").innerHTML = "";

    $("messageForm")?.classList.add(
      "hidden"
    );

  });


  socket.on("matched", data => {

    if (!data) return;

    room = data.room || null;
    partner = data.partner || null;

    $("searching")?.classList.add(
      "hidden"
    );

    $("messageForm")?.classList.remove(
      "hidden"
    );

    if (partner) {

      $("partnerName").textContent =
        partner.name || "کاربر";

      const gender =
        partner.gender === "female"
          ? "زن"
          : "مرد";

      $("partnerMeta").textContent =
        (partner.city || "نامشخص") +
        " • " +
        gender;

      avatar(
        $("partnerPhoto"),
        partner.photo
      );

    }

    $("messages").innerHTML = `
      <div class="msg">
        👋 گفت‌وگو شروع شد!
        <br>
        سلام کن 😊
      </div>
    `;

    $("messageInput")?.focus();

  });


  socket.on("message", message => {

    if (!message) return;

    const div =
      document.createElement("div");

    div.className = "msg";

    div.innerHTML =
      escapeHtml(message.text) +
      (
        message.time
          ? "<time>" +
            escapeHtml(message.time) +
            "</time>"
          : ""
      );

    $("messages").appendChild(div);

    $("messages").scrollTop =
      $("messages").scrollHeight;

  });


  socket.on("left_chat", () => {

    room = null;
    partner = null;

    show("homePage");

    $("messages").innerHTML = "";

  });


  socket.on("reported", message => {

    toast(
      message || "گزارش ثبت شد."
    );

  });


  socket.on("error_msg", message => {

    toast(
      message || "خطایی رخ داد."
    );

  });


  socket.on("connect_error", error => {

    console.error(
      "Socket error:",
      error
    );

    toast(
      "اتصال به سرور برقرار نشد."
    );

  });


  socket.on("disconnect", () => {

    console.log(
      "Disconnected"
    );

  });

}


/* ---------------- FIND ---------------- */

document
  .querySelectorAll(".findBtn")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        if (!socket) {

          toast(
            "در حال اتصال به سرور..."
          );

          connectSocket();

          return;
        }

        if (!socket.connected) {

          toast(
            "سرور در دسترس نیست."
          );

          return;
        }

        const gender =
          button.dataset.gender;

        room = null;
        partner = null;

        show("chatPage");

        $("searching")?.classList.remove(
          "hidden"
        );

        $("messageForm")?.classList.add(
          "hidden"
        );

        $("messages").innerHTML = "";

        socket.emit(
          "find",
          {
            lookingFor: gender
          }
        );

      }
    );

  });


/* ---------------- NEXT ---------------- */

$("nextBtn")?.addEventListener(
  "click",
  () => {

    if (!socket) return;

    socket.emit("next");

    room = null;
    partner = null;

    $("messageForm")?.classList.add(
      "hidden"
    );

    $("searching")?.classList.remove(
      "hidden"
    );

    $("messages").innerHTML = "";

  }
);


/* ---------------- CANCEL ---------------- */

$("cancelSearch")?.addEventListener(
  "click",
  () => {

    if (socket) {
      socket.emit("next");
    }

    room = null;
    partner = null;

    show("homePage");

  }
);


/* ---------------- MESSAGE ---------------- */

$("messageForm")?.addEventListener(
  "submit",
  event => {

    event.preventDefault();

    const input =
      $("messageInput");

    if (!input) return;

    const text =
      input.value.trim();

    if (!text) return;

    if (!socket || !socket.connected) {

      toast(
        "اتصال به سرور قطع است."
      );

      return;
    }

    if (!room) {

      toast(
        "هنوز با کسی متصل نشده‌ای."
      );

      return;
    }

    /*
      پیام را فقط یک بار از سرور دریافت می‌کنیم.
      بنابراین اینجا خودمان پیام را اضافه نمی‌کنیم.
    */

    socket.emit(
      "message",
      {
        room: room,
        text: text
      }
    );

    input.value = "";

    input.focus();

  }
);


/* ---------------- REPORT ---------------- */

$("reportBtn")?.addEventListener(
  "click",
  () => {

    if (!partner) {

      toast(
        "ابتدا با یک نفر چت کن."
      );

      return;
    }

    const reason =
      prompt(
        "دلیل گزارش را بنویس:"
      );

    if (!reason) return;

    if (!socket) return;

    socket.emit(
      "report",
      {
        reportedId: partner.id,
        reason: reason
      }
    );

  }
);


/* ---------------- START ---------------- */

(function start() {

  /*
    بدون ثبت نام!
  */

  createGuest();

  renderMe();

  show("homePage");

  connectSocket();

})();