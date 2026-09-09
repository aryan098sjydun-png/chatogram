"use strict";

/*
  ==========================================
  CHATOGRAM - Frontend
  بدون ثبت نام
  چت واقعی با Socket.IO
  ==========================================
*/


/*
  ⚠️ خیلی مهم:
  اینجا آدرس Render سرور را قرار بده.

  مثال:
  const SERVER_URL = "https://chatogram-xxxx.onrender.com";

  آدرس واقعی Render خودت را جایگزین کن.
*/

const SERVER_URL = "https://YOUR-RENDER-APP.onrender.com";


let me = null;
let partner = null;
let room = null;
let socket = null;


/* ==========================================
   HELPERS
   ========================================== */

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

  if (home) {
    home.classList.add("hidden");
  }

  if (chat) {
    chat.classList.add("hidden");
  }

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

  if (!image) {
    return;
  }

  if (photo) {

    image.src = photo;
    image.style.objectFit = "cover";

  } else {

    image.removeAttribute("src");

    image.style.background =
      "linear-gradient(135deg,#6b54f5,#282f4a)";

  }
}


/* ==========================================
   GUEST USER
   ========================================== */

function createGuest() {

  const saved =
    localStorage.getItem("chatogram_profile");

  if (saved) {

    try {

      const profile =
        JSON.parse(saved);

      if (
        profile &&
        profile.id &&
        profile.name &&
        profile.gender &&
        profile.city
      ) {

        me = profile;

        return me;
      }

    } catch (_) {

      localStorage.removeItem(
        "chatogram_profile"
      );

    }
  }


  const id =
    "guest_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .substring(2, 10);


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


/* ==========================================
   PROFILE
   ========================================== */

function renderMe() {

  if (!me) {
    return;
  }


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


/* ==========================================
   SOCKET.IO CONNECTION
   ========================================== */

function connectSocket() {

  /*
    اگر اتصال قبلی وجود دارد،
    ابتدا قطعش می‌کنیم.
  */

  if (socket) {

    try {
      socket.disconnect();
    } catch (_) {}

    socket = null;
  }


  /*
    بررسی آدرس سرور
  */

  if (
    !SERVER_URL ||
    SERVER_URL.includes("YOUR-RENDER-APP")
  ) {

    toast(
      "آدرس سرور Render هنوز داخل app.js قرار نگرفته است."
    );

    console.error(
      "SERVER_URL is not configured."
    );

    return;
  }


  /*
    اتصال مستقیم به Render
  */

  socket = io(
    SERVER_URL,
    {
      transports: [
        "websocket",
        "polling"
      ],

      reconnection: true,

      reconnectionAttempts: Infinity,

      reconnectionDelay: 1000,

      timeout: 20000
    }
  );


  /* ========================================
     CONNECTED
     ======================================== */

  socket.on("connect", () => {

    console.log(
      "Chatogram connected:",
      socket.id
    );


    /*
      ورود مهمان
    */

    socket.emit(
      "guest_login",
      {
        profile: me
      }
    );

  });


  /* ========================================
     GUEST PROFILE
     ======================================== */

  socket.on(
    "guest_profile",
    profile => {

      if (!profile) {
        return;
      }


      me = profile;


      localStorage.setItem(
        "chatogram_profile",
        JSON.stringify(me)
      );


      renderMe();

    }
  );


  /* ========================================
     ONLINE USERS
     ======================================== */

  socket.on(
    "online_users",
    list => {

      if (!Array.isArray(list)) {
        return;
      }


      if ($("onlineCount")) {

        $("onlineCount").textContent =
          list.length;

      }


      const box =
        $("onlineList");


      if (!box) {
        return;
      }


      box.innerHTML = "";


      const others =
        list
          .filter(
            user =>
              user &&
              user.id !== me?.id
          )
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
              <small>
                وقتی کاربران وارد شوند اینجا نمایش داده می‌شوند.
              </small>
            </div>

          </div>
        `;

      }

    }
  );


  /* ========================================
     SEARCHING
     ======================================== */

  socket.on(
    "searching",
    () => {

      room = null;
      partner = null;


      show("chatPage");


      $("searching")?.classList.remove(
        "hidden"
      );


      $("messageForm")?.classList.add(
        "hidden"
      );


      if ($("messages")) {

        $("messages").innerHTML = `
          <div class="msg">
            🔎 در حال پیدا کردن یک نفر...
            <br>
            لطفاً کمی صبر کن.
          </div>
        `;

      }

    }
  );


  /* ========================================
     MATCHED
     ======================================== */

  socket.on(
    "matched",
    data => {

      if (!data) {
        return;
      }


      room =
        data.room || null;


      partner =
        data.partner || null;


      $("searching")?.classList.add(
        "hidden"
      );


      $("messageForm")?.classList.remove(
        "hidden"
      );


      if (partner) {

        if ($("partnerName")) {

          $("partnerName").textContent =
            partner.name || "کاربر";

        }


        const gender =
          partner.gender === "female"
            ? "زن"
            : "مرد";


        if ($("partnerMeta")) {

          $("partnerMeta").textContent =
            (partner.city || "نامشخص") +
            " • " +
            gender;

        }


        avatar(
          $("partnerPhoto"),
          partner.photo
        );

      }


      if ($("messages")) {

        $("messages").innerHTML = `
          <div class="msg">
            👋 گفت‌وگو شروع شد!
            <br>
            سلام کن 😊
          </div>
        `;

      }


      $("messageInput")?.focus();

    }
  );


  /* ========================================
     MESSAGE
     ======================================== */

  socket.on(
    "message",
    message => {

      if (!message) {
        return;
      }


      const div =
        document.createElement("div");


      div.className =
        "msg";


      div.innerHTML =
        escapeHtml(
          message.text || ""
        ) +

        (
          message.time
            ? `
              <time>
                ${escapeHtml(message.time)}
              </time>
            `
            : ""
        );


      if ($("messages")) {

        $("messages").appendChild(div);

        $("messages").scrollTop =
          $("messages").scrollHeight;

      }

    }
  );


  /* ========================================
     LEFT CHAT
     ======================================== */

  socket.on(
    "left_chat",
    () => {

      room = null;

      partner = null;


      if ($("messageForm")) {

        $("messageForm").classList.add(
          "hidden"
        );

      }


      show("homePage");


      if ($("messages")) {

        $("messages").innerHTML = "";

      }

    }
  );


  /* ========================================
     REPORT
     ======================================== */

  socket.on(
    "reported",
    message => {

      toast(
        message ||
        "گزارش ثبت شد."
      );

    }
  );


  /* ========================================
     SERVER ERROR
     ======================================== */

  socket.on(
    "error_msg",
    message => {

      toast(
        message ||
        "خطایی رخ داد."
      );

    }
  );


  /* ========================================
     CONNECTION ERROR
     ======================================== */

  socket.on(
    "connect_error",
    error => {

      console.error(
        "Socket connection error:",
        error
      );


      toast(
        "اتصال به سرور برقرار نشد."
      );

    }
  );


  /* ========================================
     DISCONNECT
     ======================================== */

  socket.on(
    "disconnect",
    reason => {

      console.log(
        "Chatogram disconnected:",
        reason
      );

    }
  );

}


/* ==========================================
   FIND BUTTONS
   ========================================== */

document
  .querySelectorAll(".findBtn")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        /*
          اگر Socket ساخته نشده،
          اتصال را برقرار کن.
        */

        if (!socket) {

          toast(
            "در حال اتصال به سرور..."
          );


          connectSocket();


          /*
            کمی صبر می‌کنیم تا اتصال برقرار شود.
          */

          setTimeout(() => {

            if (
              socket &&
              socket.connected
            ) {

              startSearch(button);

            }

          }, 1200);


          return;
        }


        /*
          اگر Socket ساخته شده ولی
          هنوز وصل نیست.
        */

        if (!socket.connected) {

          toast(
            "در حال اتصال به سرور..."
          );


          connectSocket();


          setTimeout(() => {

            if (
              socket &&
              socket.connected
            ) {

              startSearch(button);

            }

          }, 1200);


          return;
        }


        startSearch(button);

      }
    );

  });


function startSearch(button) {

  if (
    !socket ||
    !socket.connected
  ) {

    toast(
      "سرور در دسترس نیست."
    );

    return;
  }


  const gender =
    button.dataset.gender;


  if (
    ![
      "male",
      "female",
      "any"
    ].includes(gender)
  ) {

    toast(
      "نوع چت نامعتبر است."
    );

    return;
  }


  room = null;

  partner = null;


  show("chatPage");


  $("searching")?.classList.remove(
    "hidden"
  );


  $("messageForm")?.classList.add(
    "hidden"
  );


  if ($("messages")) {

    $("messages").innerHTML = `
      <div class="msg">
        🔎 در حال پیدا کردن مخاطب...
      </div>
    `;

  }


  socket.emit(
    "find",
    {
      lookingFor: gender
    }
  );

}


/* ==========================================
   NEXT
   ========================================== */

$("nextBtn")?.addEventListener(
  "click",
  () => {

    if (
      !socket ||
      !socket.connected
    ) {

      toast(
        "اتصال به سرور برقرار نیست."
      );

      return;
    }


    socket.emit(
      "next"
    );


    room = null;

    partner = null;


    $("messageForm")?.classList.add(
      "hidden"
    );


    $("searching")?.classList.remove(
      "hidden"
    );


    if ($("messages")) {

      $("messages").innerHTML = `
        <div class="msg">
          🔎 در حال پیدا کردن نفر بعدی...
        </div>
      `;

    }

  }
);


/* ==========================================
   CANCEL SEARCH
   ========================================== */

$("cancelSearch")?.addEventListener(
  "click",
  () => {

    if (
      socket &&
      socket.connected
    ) {

      socket.emit(
        "next"
      );

    }


    room = null;

    partner = null;


    $("messageForm")?.classList.add(
      "hidden"
    );


    show("homePage");

  }
);


/* ==========================================
   SEND MESSAGE
   ========================================== */

$("messageForm")?.addEventListener(
  "submit",
  event => {

    event.preventDefault();


    const input =
      $("messageInput");


    if (!input) {
      return;
    }


    const text =
      input.value.trim();


    if (!text) {
      return;
    }


    if (
      !socket ||
      !socket.connected
    ) {

      toast(
        "اتصال به سرور قطع شده است."
      );

      return;
    }


    if (!room) {

      toast(
        "هنوز به کسی وصل نشده‌ای."
      );

      return;
    }


    /*
      پیام فقط برای سرور ارسال می‌شود.
      سرور آن را به هر دو نفر می‌فرستد.
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


/* ==========================================
   REPORT
   ========================================== */

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


    if (!reason) {
      return;
    }


    if (
      !socket ||
      !socket.connected
    ) {

      toast(
        "اتصال به سرور برقرار نیست."
      );

      return;
    }


    socket.emit(
      "report",
      {
        reportedId: partner.id,
        reason: reason
      }
    );

  }
);


/* ==========================================
   START APP
   ========================================== */

(function start() {

  /*
    بدون ثبت نام
  */

  createGuest();


  renderMe();


  show("homePage");


  /*
    اتصال به سرور واقعی
  */

  connectSocket();

})();