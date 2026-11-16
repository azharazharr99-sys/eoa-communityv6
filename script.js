(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const config = window.EOA_CONFIG || {};
  const configured = config.SUPABASE_URL && !config.SUPABASE_URL.includes("YOUR-PROJECT")
    && config.SUPABASE_ANON_KEY && !config.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
  const supabase = configured && window.supabase
    ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
    : null;

  let currentUser = null, currentProfile = null, settings = {}, members = [], announcements = [], authMode = "login";
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const storage = { get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }, set(key, value) { try { localStorage.setItem(key, value); } catch {} } };
  let soundEnabled = storage.get("eoa-sound", "on") !== "off";
  let audioContext = null;
  function applyTheme(theme) {
    const light = theme === "light";
    document.body.classList.toggle("light-mode", light);
    const button = $("#themeButton");
    button.textContent = light ? "☼" : "◐";
    button.setAttribute("aria-label", light ? "Aktifkan mode gelap" : "Aktifkan mode terang");
    button.title = light ? "Aktifkan mode gelap" : "Aktifkan mode terang";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#f4f5fb" : "#090914");
  }
  function updateSoundButton() {
    const button = $("#soundButton");
    button.textContent = soundEnabled ? "♫" : "♩";
    button.title = soundEnabled ? "Matikan suara" : "Aktifkan suara";
    button.setAttribute("aria-label", button.title);
    button.classList.toggle("sound-muted", !soundEnabled);
  }
  function playClickSound() {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioContext ||= new AudioCtx();
      if (audioContext.state === "suspended") audioContext.resume();
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(660, now);
      oscillator.frequency.exponentialRampToValueAtTime(440, now + .045);
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(.045, now + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, now + .075);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(now); oscillator.stop(now + .08);
    } catch (error) { console.debug("UI audio unavailable", error); }
  }
  applyTheme(storage.get("eoa-theme", "dark"));
  const fallbackSettings = {
    welcome_title: "Membangun koneksi, menciptakan dampak.",
    welcome_description: "Ruang kolaborasi untuk bertumbuh, berbagi gagasan, dan menciptakan karya.",
    about_title: "Satu ruang, banyak kemungkinan.",
    about_text: "EOA Community menjadi tempat bertukar ide, membangun relasi, dan mengembangkan proyek bersama."
  };

  function toast(message, type = "info") {
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    $("#toastContainer").append(node);
    requestAnimationFrame(() => node.classList.add("show"));
    setTimeout(() => { node.classList.remove("show"); setTimeout(() => node.remove(), 300); }, 3400);
  }
  function setConnection(online, message) {
    $("#connectionDot").classList.toggle("offline", !online);
    $("#connectionText").textContent = message;
  }
  function initials(name = "Guest") {
    return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
  }
  function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  }
  function formatDate(value) {
    return new Intl.DateTimeFormat("id-ID", { day:"numeric", month:"long", year:"numeric" }).format(new Date(value));
  }
  function showModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
  }
  function closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true");
    if (!$(".modal-backdrop.open")) document.body.classList.remove("modal-open");
  }
  function navigate(page) {
    if (page === "admin" && currentProfile?.role !== "admin") return toast("Akses admin diperlukan.", "error");
    $$(".page").forEach(el => el.classList.toggle("active", el.id === `page-${page}`));
    $$(".nav-link").forEach(el => el.classList.toggle("active", el.dataset.page === page));
    $("#breadcrumbPage").textContent = ({ overview:"Overview", solar:"Observatorium", members:"Anggota", announcements:"Pengumuman", owner:"Tentang Owner", admin:"Admin Panel" })[page];
    $("#sidebar").classList.remove("mobile-open");
    window.scrollTo({ top:0, behavior:"smooth" });
  }
  function setAuthUI() {
    const logged = !!currentUser;
    const name = currentProfile?.full_name || currentUser?.email?.split("@")[0] || "Guest";
    $("#authButton").innerHTML = logged ? "Keluar <span>↗</span>" : "Masuk <span>↗</span>";
    $("#sideName").textContent = name;
    $("#sideRole").textContent = currentProfile?.role === "admin" ? "Administrator" : logged ? (currentProfile?.status === "active" ? "Anggota aktif" : "Menunggu verifikasi") : "Belum login";
    $("#sideAvatar").textContent = initials(name);
    $$(".admin-only").forEach(el => el.classList.toggle("hidden", currentProfile?.role !== "admin"));
    if (currentProfile?.role !== "admin" && $("#page-admin").classList.contains("active")) navigate("overview");
  }
  async function loadProfile() {
    if (!supabase || !currentUser) { currentProfile = null; setAuthUI(); return; }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
    if (error) console.error(error);
    currentProfile = data;
    setAuthUI();
  }
  async function loadSettings() {
    if (!supabase) { settings = { ...fallbackSettings }; applySettings(); return; }
    const { data, error } = await supabase.from("community_settings").select("key,value");
    if (error) { console.error(error); settings = { ...fallbackSettings }; }
    else settings = Object.fromEntries((data || []).map(row => [row.key, row.value]));
    settings = { ...fallbackSettings, ...settings }; applySettings();
  }
  function applySettings() {
    const title = settings.welcome_title || fallbackSettings.welcome_title;
    const parts = title.split(",");
    $("#welcomeTitle").innerHTML = `${escapeHTML(parts[0] || title)}<br><em>${escapeHTML(parts.slice(1).join(",").trim() || "menciptakan dampak.")}</em>`;
    $("#welcomeDescription").textContent = settings.welcome_description || fallbackSettings.welcome_description;
    $("#aboutTitle").textContent = settings.about_title || fallbackSettings.about_title;
    $("#aboutText").textContent = settings.about_text || fallbackSettings.about_text;
    const form = $("#settingsForm");
    if (form) Object.keys(fallbackSettings).forEach(key => { if (form.elements[key]) form.elements[key].value = settings[key] || ""; });
  }
  async function loadMembers() {
    if (!supabase) { members = []; renderMembers(); updateStats(); return; }
    const { data, error } = await supabase.from("profiles").select("id,full_name,city,status,created_at").order("created_at", { ascending:false });
    if (error) { console.error(error); toast("Data anggota gagal dimuat.", "error"); return; }
    members = data || []; renderMembers(); renderPending(); updateStats();
  }
  async function loadAnnouncements() {
    if (!supabase) { announcements = []; renderAnnouncements(); updateStats(); return; }
    const { data, error } = await supabase.from("announcements").select("id,title,body,category,created_at,author_id").order("created_at", { ascending:false }).limit(50);
    if (error) { console.error(error); toast("Pengumuman gagal dimuat.", "error"); return; }
    announcements = data || []; renderAnnouncements(); updateStats();
  }
  function updateStats() {
    const count = members.length, active = members.filter(x => x.status === "active").length, pending = members.filter(x => x.status === "pending").length;
    animateNumber($("#totalMembers"), count); animateNumber($("#activeMembers"), active); animateNumber($("#pendingMembers"), pending); animateNumber($("#announcementCount"), announcements.length);
    $("#pendingAdminCount").textContent = pending;
  }
  function animateNumber(element, target) {
    if (!element) return;
    const start = Number(element.dataset.value || 0), duration = 650, began = performance.now();
    element.dataset.value = target;
    function tick(now) {
      const progress = Math.min((now - began) / duration, 1), eased = 1 - Math.pow(1 - progress, 4);
      element.textContent = Math.round(start + (target - start) * eased).toLocaleString("id-ID");
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function renderMembers() {
    const query = ($("#memberSearch")?.value || "").toLowerCase();
    const filter = $("#memberFilter")?.value || "all";
    const visible = members.filter(member => (filter === "all" || member.status === filter) && `${member.full_name} ${member.city || ""}`.toLowerCase().includes(query));
    $("#membersGrid").innerHTML = visible.length ? visible.map(member => `
      <article class="member-card"><div class="member-avatar">${escapeHTML(initials(member.full_name))}</div><div class="member-info"><b>${escapeHTML(member.full_name || "Anggota EOA")}</b><span>${escapeHTML(member.city || "Lokasi belum diisi")}</span></div><span class="status-badge ${member.status === "active" ? "active" : "pending"}">${member.status === "active" ? "Aktif" : "Pending"}</span></article>`).join("") : `<div class="empty-state">Belum ada anggota yang cocok dengan pencarian.</div>`;
  }
  function announcementCard(item, compact = false) {
    return `<article class="announcement-item ${compact ? "compact" : ""}"><div class="announcement-meta"><span class="category-tag">${escapeHTML(item.category || "Informasi")}</span><time>${formatDate(item.created_at)}</time></div><h4>${escapeHTML(item.title)}</h4><p>${escapeHTML(item.body)}</p></article>`;
  }
  function renderAnnouncements() {
    $("#latestAnnouncements").innerHTML = announcements.length ? announcements.slice(0, 3).map(item => announcementCard(item, true)).join("") : `<div class="empty-state small-empty">Belum ada pengumuman.</div>`;
    $("#announcementFeed").innerHTML = announcements.length ? announcements.map(item => announcementCard(item)).join("") : `<div class="empty-state">Belum ada pengumuman yang diterbitkan.</div>`;
    $("#adminAnnouncementList").innerHTML = announcements.length ? announcements.map(item => `<div class="admin-announcement-row"><div><b>${escapeHTML(item.title)}</b><small>${formatDate(item.created_at)} · ${escapeHTML(item.category)}</small></div><button class="danger-button" data-delete-announcement="${item.id}" aria-label="Hapus pengumuman">Hapus</button></div>`).join("") : `<div class="empty-state">Belum ada pengumuman.</div>`;
  }
  function renderPending() {
    const pending = members.filter(member => member.status === "pending");
    $("#pendingList").innerHTML = pending.length ? pending.map(member => `<div class="pending-row"><div><b>${escapeHTML(member.full_name || "Anggota baru")}</b><small>${escapeHTML(member.city || "Kota tidak dicantumkan")}</small></div><button class="approve-button" data-approve="${member.id}">Setujui</button></div>`).join("") : `<div class="empty-state">Tidak ada permintaan baru.</div>`;
  }
  async function refreshAll() {
    await Promise.all([loadSettings(), loadMembers(), loadAnnouncements()]);
  }
  async function init() {
    $("#currentDate").textContent = new Intl.DateTimeFormat("id-ID", { weekday:"long", day:"numeric", month:"long", year:"numeric" }).format(new Date());
    if (!supabase) {
      setConnection(false, "Supabase belum dikonfigurasi");
      await refreshAll();
      toast("Isi config.js dengan kredensial Supabase untuk mengaktifkan database.", "error");
      return;
    }
    setConnection(true, "Terhubung ke Supabase");
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;
    await loadProfile(); await refreshAll();
    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      setTimeout(async () => { await loadProfile(); await refreshAll(); }, 0);
    });
    const channel = supabase.channel("eoa-live-updates")
      .on("postgres_changes", { event:"*", schema:"public", table:"profiles" }, () => loadMembers())
      .on("postgres_changes", { event:"*", schema:"public", table:"announcements" }, () => loadAnnouncements())
      .on("postgres_changes", { event:"*", schema:"public", table:"community_settings" }, () => loadSettings())
      .subscribe(status => setConnection(status === "SUBSCRIBED", status === "SUBSCRIBED" ? "Sinkronisasi aktif" : "Menghubungkan..."));
  }

  $$(".nav-link").forEach(button => button.addEventListener("click", () => navigate(button.dataset.page)));
  $$("[data-goto]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.goto)));
  const heroCard = $(".hero-card");
  if (heroCard && window.matchMedia("(hover: hover) and (pointer: fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    let pointerFrame = 0, pointerPoint = null;
    heroCard.addEventListener("pointermove", event => {
      pointerPoint = { x:event.clientX, y:event.clientY };
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        const rect = heroCard.getBoundingClientRect();
        const x = (pointerPoint.x - rect.left) / rect.width - .5;
        const y = (pointerPoint.y - rect.top) / rect.height - .5;
        heroCard.style.setProperty("--hero-rx", `${-y * 3.2}deg`);
        heroCard.style.setProperty("--hero-ry", `${x * 4}deg`);
      });
    }, { passive:true });
    heroCard.addEventListener("pointerleave", () => {
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      pointerFrame = 0;
      heroCard.style.setProperty("--hero-rx", "0deg");
      heroCard.style.setProperty("--hero-ry", "0deg");
    }, { passive:true });
  }

  $("#menuToggle").addEventListener("click", () => $("#sidebar").classList.toggle("mobile-open"));
  $("#themeButton").addEventListener("click", () => {
    const next = document.body.classList.contains("light-mode") ? "dark" : "light";
    storage.set("eoa-theme", next); applyTheme(next);
  });
  updateSoundButton();
  $("#soundButton").addEventListener("click", () => {
    soundEnabled = !soundEnabled; storage.set("eoa-sound", soundEnabled ? "on" : "off"); updateSoundButton();
    if (soundEnabled) playClickSound();
  });
  // Delegated feedback also covers buttons created later by the dashboard.
  document.addEventListener("pointerdown", event => {
    const target = event.target.closest("button, a, [role='button']");
    if (!target || target.disabled || target.classList.contains("no-click-effect")) return;
    target.classList.remove("tap-feedback");
    if (!prefersReducedMotion) { void target.offsetWidth; target.classList.add("tap-feedback"); }
  }, { passive:true });
  document.addEventListener("click", event => {
    const target = event.target.closest("button, a, [role='button']");
    if (target && !target.disabled && target.id !== "soundButton") playClickSound();
  }, true);
  $("#memberSearch").addEventListener("input", renderMembers);
  $("#memberFilter").addEventListener("change", renderMembers);
  $("#joinButton").addEventListener("click", () => currentUser ? navigate("members") : (setAuthMode("signup"), showModal("authModal")));
  $("#memberJoinButton").addEventListener("click", () => currentUser ? toast("Akunmu sudah terdaftar.", "info") : (setAuthMode("signup"), showModal("authModal")));
  $("#authButton").addEventListener("click", async () => {
    if (!currentUser) { setAuthMode("login"); showModal("authModal"); return; }
    if (supabase) { const { error } = await supabase.auth.signOut(); if (error) toast(error.message, "error"); else toast("Kamu sudah keluar."); }
  });
  $("#profileButton").addEventListener("click", () => currentUser ? toast(`Login sebagai ${currentUser.email}`) : (setAuthMode("login"), showModal("authModal")));
  $$("[data-close]").forEach(button => button.addEventListener("click", () => closeModal(button.dataset.close)));
  $$(".modal-backdrop").forEach(backdrop => backdrop.addEventListener("click", event => { if (event.target === backdrop) closeModal(backdrop.id); }));
  document.addEventListener("keydown", event => { if (event.key === "Escape") $$(".modal-backdrop.open").forEach(modal => closeModal(modal.id)); });

  function setAuthMode(mode) {
    authMode = mode;
    $$(".auth-tabs button").forEach(button => button.classList.toggle("selected", button.dataset.authMode === mode));
    $$(".signup-field").forEach(field => field.classList.toggle("hidden", mode !== "signup"));
    $("#authTitle").textContent = mode === "login" ? "Selamat datang kembali." : "Mulai terhubung.";
    $("#authSubtitle").textContent = mode === "login" ? "Masuk untuk mengakses ruang komunitas." : "Buat akun untuk mengajukan keanggotaan EOA.";
    $("#authForm button[type=submit]").innerHTML = `${mode === "login" ? "Masuk" : "Buat akun"} <span>↗</span>`;
    $("#authMessage").textContent = "";
  }
  $$(".auth-tabs button").forEach(button => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));
  $("#authForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!supabase) return toast("Supabase belum dikonfigurasi.", "error");
    const form = new FormData(event.currentTarget), email = form.get("email"), password = form.get("password");
    const submit = event.currentTarget.querySelector("button[type=submit]");
    submit.disabled = true; submit.textContent = "Memproses...";
    let result;
    if (authMode === "signup") {
      result = await supabase.auth.signUp({ email, password, options: { data: { full_name: form.get("full_name"), city: form.get("city") } } });
    } else result = await supabase.auth.signInWithPassword({ email, password });
    submit.disabled = false; submit.innerHTML = `${authMode === "login" ? "Masuk" : "Buat akun"} <span>↗</span>`;
    if (result.error) { $("#authMessage").textContent = result.error.message; $("#authMessage").className = "form-message error"; return; }
    if (authMode === "signup" && !result.data.session) { $("#authMessage").textContent = "Pendaftaran berhasil. Periksa email untuk verifikasi akun."; $("#authMessage").className = "form-message success"; }
    else { closeModal("authModal"); event.currentTarget.reset(); toast(authMode === "login" ? "Berhasil masuk." : "Akun berhasil dibuat."); }
  });

  $("#settingsForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!supabase || currentProfile?.role !== "admin") return toast("Hanya admin yang dapat mengubah pengaturan.", "error");
    const form = new FormData(event.currentTarget);
    const rows = Object.keys(fallbackSettings).map(key => ({ key, value: String(form.get(key) || "").trim(), updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("community_settings").upsert(rows, { onConflict:"key" });
    if (error) return toast(error.message, "error");
    toast("Informasi dashboard berhasil diperbarui.", "success"); await loadSettings();
  });
  function openAnnouncementModal() {
    if (currentProfile?.role !== "admin") return toast("Akses admin diperlukan.", "error");
    $("#announcementForm").reset(); $("#announcementMessage").textContent = ""; showModal("announcementModal");
  }
  $("#newAnnouncementButton").addEventListener("click", openAnnouncementModal);
  $("#adminNewAnnouncement").addEventListener("click", openAnnouncementModal);
  $("#announcementForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!supabase || currentProfile?.role !== "admin") return toast("Akses admin diperlukan.", "error");
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from("announcements").insert({ title:form.get("title"), category:form.get("category"), body:form.get("body"), author_id:currentUser.id });
    if (error) { $("#announcementMessage").textContent = error.message; $("#announcementMessage").className = "form-message error"; return; }
    closeModal("announcementModal"); toast("Pengumuman berhasil diterbitkan.", "success"); await loadAnnouncements();
  });
  document.addEventListener("click", async event => {
    const approve = event.target.closest("[data-approve]");
    const remove = event.target.closest("[data-delete-announcement]");
    if (approve) {
      if (currentProfile?.role !== "admin") return;
      const { error } = await supabase.from("profiles").update({ status:"active" }).eq("id", approve.dataset.approve);
      if (error) toast(error.message, "error"); else { toast("Anggota disetujui.", "success"); await loadMembers(); }
    }
    if (remove) {
      if (currentProfile?.role !== "admin" || !confirm("Hapus pengumuman ini?")) return;
      const { error } = await supabase.from("announcements").delete().eq("id", remove.dataset.deleteAnnouncement);
      if (error) toast(error.message, "error"); else { toast("Pengumuman dihapus."); await loadAnnouncements(); }
    }
  });


  // Solar system controls: CSS transforms keep the simulation lightweight on mobile.
  const solarSystem = $("#solarSystem");
  const solarZoom = $("#solarZoom");
  const orbitSpeed = $("#orbitSpeed");
  const pauseButton = $("#orbitPauseButton");
  const orbitTracks = $$(".orbit-track", solarSystem);
  const baseOrbitDurations = [7, 10, 14, 18, 25, 32, 40, 49];
  let orbitPaused = false;
  function applyOrbitSpeed(speed) {
    orbitTracks.forEach((track, index) => track.style.setProperty("--orbit-duration", `${baseOrbitDurations[index] / speed}s`));
    $("#speedValue").textContent = `${Number(speed).toFixed(1)}×`;
  }
  function applySolarZoom(value) {
    solarSystem.style.setProperty("--solar-zoom", Number(value) / 100);
    $("#zoomValue").textContent = `${value}%`;
  }
  pauseButton.addEventListener("click", () => {
    orbitPaused = !orbitPaused;
    solarSystem.classList.toggle("is-paused", orbitPaused);
    pauseButton.innerHTML = orbitPaused ? "▶ Lanjutkan orbit" : "Ⅱ Jeda orbit";
    pauseButton.setAttribute("aria-pressed", String(orbitPaused));
  });
  solarZoom.addEventListener("input", event => applySolarZoom(event.target.value));
  orbitSpeed.addEventListener("input", event => applyOrbitSpeed(event.target.value));
  $("#solarResetButton").addEventListener("click", () => {
    solarZoom.value = "100"; orbitSpeed.value = "1";
    applySolarZoom(100); applyOrbitSpeed(1);
    orbitPaused = false; solarSystem.classList.remove("is-paused");
    pauseButton.innerHTML = "Ⅱ Jeda orbit"; pauseButton.setAttribute("aria-pressed", "false");
  });
  applyOrbitSpeed(orbitSpeed.value);
  applySolarZoom(solarZoom.value);

  // Spotify's official iframe owns playback controls; the site only validates and embeds playlist URLs.
  const spotifyInput = $("#spotifyPlaylistUrl");
  const spotifyWrap = $("#spotifyEmbedWrap");
  const savedSpotifyUrl = storage.get("eoa-spotify-playlist", config.SPOTIFY_PLAYLIST_URL || "");
  function loadSpotifyPlaylist(rawUrl, persist = true) {
    let playlistId = "";
    try {
      const parsed = new URL(rawUrl);
      const match = parsed.hostname === "open.spotify.com" && parsed.pathname.match(/^\/(?:embed\/)?playlist\/([A-Za-z0-9]{22})\/?$/);
      if (match) playlistId = match[1];
    } catch {}
    if (!playlistId) {
      spotifyWrap.innerHTML = '<div class="spotify-empty"><span>♫</span><b>Tautan playlist tidak valid</b><small>Gunakan URL playlist dari open.spotify.com.</small></div>';
      return false;
    }
    const iframe = document.createElement("iframe");
    iframe.title = "Spotify playlist EOA Community";
    iframe.src = `https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator&theme=0`;
    iframe.width = "100%"; iframe.height = "352";
    iframe.setAttribute("frameborder", "0");
    iframe.setAttribute("allow", "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    spotifyWrap.replaceChildren(iframe);
    if (persist) storage.set("eoa-spotify-playlist", `https://open.spotify.com/playlist/${playlistId}`);
    return true;
  }
  if (savedSpotifyUrl) {
    spotifyInput.value = savedSpotifyUrl;
    if (!loadSpotifyPlaylist(savedSpotifyUrl, false)) storage.set("eoa-spotify-playlist", "");
  }
  $("#spotifyForm").addEventListener("submit", event => {
    event.preventDefault();
    if (loadSpotifyPlaylist(spotifyInput.value.trim())) toast("Playlist Spotify berhasil dimuat.", "success");
    else toast("Periksa kembali tautan playlist Spotify.", "error");
  });

  // Small interaction polish: reveal cards as they enter the viewport.
  const revealSelector = ".stat-card, .panel, .member-card, .announcement-item, .owner-profile, .owner-vision";
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) { if (!entry.isIntersecting) continue; entry.target.classList.add("revealed"); observer.unobserve(entry.target); }
  }, { threshold:.08, rootMargin:"0px 0px 40px 0px" });
  const observeAdded = root => {
    if (root.nodeType !== 1) return;
    if (root.matches?.(revealSelector)) observer.observe(root);
    root.querySelectorAll?.(revealSelector).forEach(el => observer.observe(el));
  };
  document.querySelectorAll(revealSelector).forEach(el => observer.observe(el));
  const mutationObserver = new MutationObserver(records => { for (const record of records) record.addedNodes.forEach(observeAdded); });
  mutationObserver.observe(document.body, { childList:true, subtree:true });
  init();
})();