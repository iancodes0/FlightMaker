const API_URL = "https://flightmaker-production.up.railway.app";
const DISCORD_SIGN_IN_URL =
  "https://discord.com/oauth2/authorize?client_id=1568375825445822654&response_type=code&redirect_uri=https%3A%2F%2Fturkishairlinesptfs.github.io%2F&scope=identify";

const getSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem("ptfs-session") || "null");
  } catch {
    return null;
  }
};

const setSession = (session) => sessionStorage.setItem("ptfs-session", JSON.stringify(session));

const api = async (path, options = {}) => {
  const session = getSession();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session?.token ? { "X-Session-Token": session.token } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
};

const setupAuth = async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (code) {
    try {
      setSession(await api("/api/auth/exchange", { method: "POST", body: JSON.stringify({ code }) }));
      window.history.replaceState({}, "", window.location.pathname);
    } catch (error) {
      console.error("Discord sign-in failed:", error);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }
  const session = getSession();
  document.querySelectorAll("[data-sign-in]").forEach((button) => {
    if (session) {
      button.textContent = "";
      button.classList.add("profile-chip");
      const avatar = document.createElement("img");
      avatar.src = session.user.avatarUrl;
      avatar.alt = `${session.user.username}'s Discord avatar`;
      avatar.width = 24;
      avatar.height = 24;
      const username = document.createElement("span");
      username.textContent = session.user.username;
      button.append(avatar, username);
      button.href = "#";
      button.setAttribute("aria-label", `Signed in as ${session.user.username}`);
      button.removeAttribute("role");
    } else {
      button.textContent = "Sign in";
      button.classList.remove("profile-chip");
      button.removeAttribute("aria-label");
      button.href = DISCORD_SIGN_IN_URL;
    }
  });
  document.querySelectorAll("[data-staff-link]").forEach((link) => {
    link.hidden = !session?.user?.isStaff;
  });
  return session;
};

window.ptfs = { api, getSession, setupAuth, DISCORD_SIGN_IN_URL };
