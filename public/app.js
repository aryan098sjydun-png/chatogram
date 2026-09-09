let me = null;
let partner = null;
let room = null;
let socket = null;

const $ = id => document.getElementById(id);

/* =========================
   پیام کوچک
========================= */

function toast(msg) {
  const x = $("toast");

  if (!x) {
    alert(msg);
    return;
  }

  x.textContent = msg;
  x.style.display = "block";

  clearTimeout(window._toast);

  window._toast = setTimeout(() => {
    x.style.display = "none";
  }, 2800);
}

/* =========================
   نمایش صفحات
========================= */

function show(page) {
  ["authPage", "homePage", "chatPage"].forEach(id => {
    const el = $(id);
    if (el) el.classList.add("hidden");
  });

  const target = $(page);

  if (target) {
    target.classList.remove("hidden");
  }
}

/* =========================
   عکس پروفایل
========================= */

function avatar(img, photo, fallback = "👤") {
  if (!img) return;

  if (photo) {
    img.src = photo;
    img.style.objectFit = "cover";
  } else {
    img.removeAttribute("src");
    img.style.background =
      "linear-gradient(135deg,#6b54f5,#282f4a)";
    img.alt = fallback;
  }
}

/* =========================
   جلوگیری از HTML
========================= */

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c])
  );
}

/* =========================
   نمایش اطلاعات من
========================= */

function renderMe() {
  if (!me) return;

  if ($("myName")) {
    $("myName").textContent = me.name;
  }

  if ($("myMeta")) {
    $("myMeta").textContent =
      (me.city || "") +
      " • " +
      (me.gender === "male" ? "مرد" : "زن");
  }

  avatar(
    $("myPhoto"),
    me.photo || "",
    "👤"
  );
}

/* =========================
   اتصال به سرور
========================= */

function connectSocket() {

  if (socket) {
    socket.disconnect();
  }

  socket = io();

  socket.on("connect", () => {

    socket.emit("login", {
      name: me.name,
      gender: me.gender,
      city: me.city,
      photo: me.photo || ""
    });

  });

  socket.on("profile", user => {

    me = user;

    localStorage.setItem(
      "chatogram_profile",
      JSON.stringify(me)
    );

    renderMe();

    show("homePage");

  });

  /* =====================
     کاربران آنلاین
  ===================== */

  socket.on("online_users", list => {

    if ($("onlineCount")) {
      $("onlineCount").textContent =
        list.length;
    }

    const box = $("onlineList");

    if (!box) return;

    box.innerHTML = "";

    list
      .filter(u => u.id !== me?.id)
      .slice(0, 30)
      .forEach(u => {

        const row =
          document.createElement("div");

        row.className =
          "onlineUser";

        const im =
          document.createElement("img");

        im.className =
          "avatar";

        avatar(
          im,
          u.photo,
          "👤"
        );

        const text =
          document.createElement("div");

        text.innerHTML =
          "<b>" +
          escapeHtml(u.name) +
          "</b>" +
          "<small>" +
          escapeHtml(u.city || "") +
          " • " +
          (u.gender === "male"
            ? "مرد"
            : "زن") +
          "</small>";

        row.append(im, text);

        box.append(row);

      });

    if (!box.children.length) {

      box.innerHTML =
        '<div class="onlineUser">' +
        '<span>😴</span>' +
        '<div>' +
        '<b>هنوز کسی آنلاین نیست</b>' +
        '<small>کمی بعد دوباره امتحان کن</small>' +
        '</div>' +
        '</div>';

    }

  });

  /* =====================
     در حال جستجو
  ===================== */

  socket.on("searching", () => {

    show("chatPage");

    if ($("searching")) {
      $("searching")
        .classList
        .remove("hidden");
    }

    if ($("messageForm")) {
      $("messageForm")
        .classList
        .add("hidden");
    }

    if ($("messages")) {
      $("messages").innerHTML = "";
    }

  });

  /* =====================
     پیدا شدن نفر
  ===================== */

  socket.on("matched", data => {

    room = data.room;
    partner = data.partner;

    if ($("searching")) {
      $("searching")
        .classList
        .add("hidden");
    }

    if ($("messageForm")) {
      $("messageForm")
        .classList
        .remove("hidden");
    }

    if ($("partnerName")) {
      $("partnerName").textContent =
        partner.name;
    }

    if ($("partnerMeta")) {
      $("partnerMeta").textContent =
        partner.city +
        " • " +
        (partner.gender === "male"
          ? "مرد"
          : "زن");
    }

    avatar(
      $("partnerPhoto"),
      partner.photo || "",
      "👤"
    );

    if ($("messages")) {

      $("messages").innerHTML =
        '<div class="msg">' +
        "👋 گفت‌وگو شروع شد! سلام کن." +
        "</div>";

    }

  });

  /* =====================
     دریافت پیام
  ===================== */

  socket.on("message", m => {

    const div =
      document.createElement("div");

    div.className = "msg";

    div.innerHTML =
      escapeHtml(m.text) +
      "<time>" +
      escapeHtml(m.time || "") +
      "</time>";

    if ($("messages")) {

      $("messages").append(div);

      $("messages").scrollTop =
        $("messages").scrollHeight;

    }

  });

  /* =====================
     نفر بعدی
  ===================== */

  socket.on("left_chat", () => {

    room = null;
    partner = null;

    show("homePage");

  });

  socket.on("reported", msg => {
    toast(msg);
  });

  socket.on("error_msg", msg => {
    toast(msg);
  });

  socket.on("auth_error", msg => {

    toast(msg);

    if (socket) {
      socket.disconnect();
      socket = null;
    }

    me = null;

    localStorage.removeItem(
      "chatogram_profile"
    );

    show("authPage");

  });

}

/* =========================
   ورود مستقیم
========================= */

const enterForm =
  $("enterForm");

if (enterForm) {

  enterForm.onsubmit = e => {

    e.preventDefault();

    const name =
      $("enterName")?.value.trim();

    const gender =
      $("enterGender")?.value;

    const city =
      $("enterCity")?.value.trim();

    if (!name) {
      toast("اسم خودت را وارد کن.");
      return;
    }

    if (
      !["male", "female"]
        .includes(gender)
    ) {
      toast("جنسیت را انتخاب کن.");
      return;
    }

    if (!city) {
      toast("شهرت را وارد کن.");
      return;
    }

    me = {
      id: null,
      name,
      gender,
      city,
      photo: ""
    };

    localStorage.setItem(
      "chatogram_profile",
      JSON.stringify(me)
    );

    renderMe();

    connectSocket();

  };

}

/* =========================
   دکمه‌های جستجو
========================= */

document
  .querySelectorAll(".findBtn")
  .forEach(button => {

    button.onclick = () => {

      if (!socket) {
        toast(
          "ابتدا وارد چتوگرام شوید."
        );
        return;
      }

      room = null;
      partner = null;

      show("chatPage");

      if ($("searching")) {
        $("searching")
          .classList
          .remove("hidden");
      }

      if ($("messageForm")) {
        $("messageForm")
          .classList
          .add("hidden");
      }

      if ($("messages")) {
        $("messages").innerHTML = "";
      }

      socket.emit(
        "find",
        {
          lookingFor:
            button.dataset.gender
        }
      );

    };

  });

/* =========================
   نفر بعدی
========================= */

if ($("nextBtn")) {

  $("nextBtn").onclick = () => {

    if (socket) {
      socket.emit("next");
    }

  };

}

/* =========================
   ارسال پیام
========================= */

if ($("messageForm")) {

  $("messageForm").onsubmit =
    e => {

      e.preventDefault();

      const input =
        $("messageInput");

      if (!input) return;

      const text =
        input.value.trim();

      if (
        !text ||
        !room ||
        !socket
      ) {
        return;
      }

      socket.emit(
        "message",
        {
          room,
          text
        }
      );

      input.value = "";

    };

}

/* =========================
   پروفایل
========================= */

if ($("profileBtn")) {

  $("profileBtn").onclick = () => {

    if (!me) return;

    if ($("editName")) {
      $("editName").value =
        me.name || "";
    }

    if ($("editGender")) {
      $("editGender").value =
        me.gender || "male";
    }

    if ($("editCity")) {
      $("editCity").value =
        me.city || "";
    }

    avatar(
      $("editPhoto"),
      me.photo || "",
      "👤"
    );

    $("profileModal")
      ?.classList
      .remove("hidden");

  };

}

/* =========================
   بستن پروفایل
========================= */

if ($("closeModal")) {

  $("closeModal").onclick = () => {

    $("profileModal")
      ?.classList
      .add("hidden");

  };

}

/* =========================
   انتخاب عکس
========================= */

if ($("photoInput")) {

  $("photoInput").onchange =
    e => {

      const file =
        e.target.files[0];

      if (!file) return;

      if (
        file.size >
        2 * 1024 * 1024
      ) {

        toast(
          "حجم عکس باید کمتر از ۲ مگابایت باشد."
        );

        return;
      }

      const reader =
        new FileReader();

      reader.onload = () => {

        if ($("editPhoto")) {

          $("editPhoto").src =
            reader.result;

          $("editPhoto")
            .dataset
            .photo =
            reader.result;

        }

      };

      reader.readAsDataURL(file);

    };

}

/* =========================
   ذخیره پروفایل
========================= */

if ($("saveProfile")) {

  $("saveProfile").onclick = () => {

    if (!me) return;

    const name =
      $("editName")?.value.trim();

    const gender =
      $("editGender")?.value;

    const city =
      $("editCity")?.value.trim();

    const photo =
      $("editPhoto")
        ?.dataset
        .photo ||
      me.photo ||
      "";

    if (!name) {
      toast("نام را وارد کنید.");
      return;
    }

    if (!city) {
      toast("شهر را وارد کنید.");
      return;
    }

    if (
      !["male", "female"]
        .includes(gender)
    ) {
      toast("جنسیت را انتخاب کنید.");
      return;
    }

    me.name = name;
    me.gender = gender;
    me.city = city;
    me.photo = photo;

    localStorage.setItem(
      "chatogram_profile",
      JSON.stringify(me)
    );

    renderMe();

    if (socket) {

      socket.emit(
        "login",
        {
          name: me.name,
          gender: me.gender,
          city: me.city,
          photo: me.photo
        }
      );

    }

    $("profileModal")
      ?.classList
      .add("hidden");

    toast(
      "پروفایل ذخیره شد."
    );

  };

}

/* =========================
   گزارش
========================= */

if ($("reportBtn")) {

  $("reportBtn").onclick = () => {

    if ($("reportReason")) {
      $("reportReason").value = "";
    }

    $("reportModal")
      ?.classList
      .remove("hidden");

  };

}

if ($("closeReport")) {

  $("closeReport").onclick = () => {

    $("reportModal")
      ?.classList
      .add("hidden");

  };

}

if ($("sendReport")) {

  $("sendReport").onclick = () => {

    const reason =
      $("reportReason")
        ?.value
        .trim();

    if (!reason) {
      toast(
        "دلیل گزارش را بنویسید."
      );
      return;
    }

    if (!socket || !partner) {
      toast(
        "کاربری برای گزارش وجود ندارد."
      );
      return;
    }

    socket.emit(
      "report",
      {
        reportedId:
          partner.id,
        reason
      }
    );

    $("reportModal")
      ?.classList
      .add("hidden");

  };

}

/* =========================
   خروج
========================= */

if ($("logoutBtn")) {

  $("logoutBtn").onclick = () => {

    if (socket) {
      socket.disconnect();
      socket = null;
    }

    me = null;
    partner = null;
    room = null;

    localStorage.removeItem(
      "chatogram_profile"
    );

    show("authPage");

  };

}

/* =========================
   شروع برنامه
========================= */

(function start() {

  const saved =
    localStorage.getItem(
      "chatogram_profile"
    );

  if (saved) {

    try {

      me = JSON.parse(saved);

      if (
        me &&
        me.name &&
        me.gender &&
        me.city
      ) {

        renderMe();

        connectSocket();

        return;

      }

    } catch (_) {}

  }

  show("authPage");

})();
