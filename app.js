const PHASE = {
  FIRST_OPPORTUNITY: "first_comment_opportunity",
  FEEDBACK: "social_feedback",
  NEW_POSTS: "new_manipulated_posts",
  SECOND_OPPORTUNITY: "second_comment_opportunity",
  COMPLETE: "complete"
};

const STORAGE_KEY = "reddit-lab-flow-v3";
const ONBOARDING_KEY = "reddit-lab-onboarding-v1";

const BASE_COMMENTS = [
  {
    id: "seed-1",
    author: "u/PolicyNerd",
    timestamp: "2h",
    text: "If platforms do nothing, hostility becomes the default norm in public discussions.",
    upvotes: 4,
    downvotes: 1,
    type: "seed"
  },
  {
    id: "seed-2",
    author: "u/FreeDebateAlways",
    timestamp: "2h",
    text: "I do not like hateful comments either, but heavy moderation can be abused quickly.",
    upvotes: 3,
    downvotes: 1,
    type: "seed"
  },
  {
    id: "seed-3",
    author: "u/CommunityMod",
    timestamp: "1h",
    text: "Harassment is not debate. There should be clear penalties for repeated abuse.",
    upvotes: 2,
    downvotes: 1,
    type: "seed"
  },
  {
    id: "seed-4",
    author: "u/AnonStudent22",
    timestamp: "1h",
    text: "Anonymous posting helps some vulnerable people speak. Removing it is risky.",
    upvotes: 1,
    downvotes: 1,
    type: "seed"
  }
];

const state = {
  username: "participant",
  participantId: "",
  phase: PHASE.FIRST_OPPORTUNITY,
  feedbackMode: "up",
  feedbackTarget: 5,
  feedbackDelivered: 0,
  firstCommentId: "",
  secondCommentId: "",
  post: {
    subreddit: "r/CampusDebates",
    author: "u/CityDeskNews",
    timestamp: "2h",
    title: "City council debates a policy response after a spike in hostile online posts",
    body:
      "A local review found that hate-oriented comments increased after a controversial incident. Council members are split: stricter moderation may reduce harm, while critics warn it could silence disagreement. Read the story and then read the comment section before posting.",
    upvotes: 4,
    downvotes: 1
  },
  comments: cloneBaseComments(),
  logs: []
};

const manipulatedComments = [
  "This thread already shows how quickly people normalize aggressive language.",
  "Seeing what gets upvoted here says a lot about group norms.",
  "People copy the tone they think the crowd rewards.",
  "Once one hostile comment gets traction, others escalate to match it.",
  "The approval signal is doing more than the article itself."
];

let feedbackTimer = null;
let manipulatedTimer = null;
let manipulatedIndex = 0;
let modalAction = null;
let toastTimer = null;
let audioCtx = null;

const els = {
  postCard: document.getElementById("post-card"),
  commentsList: document.getElementById("comments-list"),
  commentForm: document.getElementById("comment-form"),
  commentInput: document.getElementById("comment-input"),
  charCount: document.getElementById("char-count"),
  username: document.getElementById("username"),
  participantId: document.getElementById("participant-id"),
  feedbackMode: document.getElementById("feedback-mode"),
  feedbackCount: document.getElementById("feedback-count"),
  phaseText: document.getElementById("phase-text"),
  statPhase: document.getElementById("stat-phase"),
  statEvents: document.getElementById("stat-events"),
  statFeedback: document.getElementById("stat-feedback"),
  exportJson: document.getElementById("export-json"),
  exportCsv: document.getElementById("export-csv"),
  resetSession: document.getElementById("reset-session"),
  modal: document.getElementById("modal"),
  modalTitle: document.getElementById("modal-title"),
  modalBody: document.getElementById("modal-body"),
  modalAction: document.getElementById("modal-action"),
  toast: document.getElementById("toast")
};

function cloneBaseComments() {
  return BASE_COMMENTS.map((item) => ({ ...item }));
}

function init() {
  bindEvents();
  hydrateFromStorage();
  renderAll();
  startFlow();
}

function bindEvents() {
  els.commentInput.addEventListener("input", () => {
    els.charCount.textContent = `${els.commentInput.value.length} / 500`;
  });

  els.commentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitParticipantComment();
  });

  els.participantId.addEventListener("change", () => {
    state.participantId = sanitizeId(els.participantId.value.trim());
    els.participantId.value = state.participantId;
    persist();
    persistOnboarding();
    logEvent("participant_set", "experiment", { value: state.participantId });
  });

  els.feedbackMode.addEventListener("change", () => {
    state.feedbackMode = els.feedbackMode.value === "down" ? "down" : "up";
    persist();
    logEvent("feedback_mode_set", "experiment", { mode: state.feedbackMode });
  });

  els.feedbackCount.addEventListener("change", () => {
    const count = Math.max(5, Number(els.feedbackCount.value) || 5);
    state.feedbackTarget = count;
    els.feedbackCount.value = String(count);
    persist();
    logEvent("feedback_target_set", "experiment", { count });
  });

  els.exportJson.addEventListener("click", () => exportData(false));
  els.exportCsv.addEventListener("click", () => exportData(true));

  els.resetSession.addEventListener("click", () => {
    const confirmed = confirm("Reset this experiment session?");
    if (!confirmed) return;
    hardReset();
  });

  els.modalAction.addEventListener("click", () => {
    if (typeof modalAction === "function") {
      const action = modalAction;
      modalAction = null;
      closeModal();
      action();
    } else {
      closeModal();
    }
  });
}

function startFlow() {
  setPhase(PHASE.FIRST_OPPORTUNITY);
  lockComposer("First comment prompt is active. Write your first comment now.", true);

  showModal(
    "Step 5: First Comment Opportunity",
    "Please write your first comment now.",
    "Write First Comment",
    () => {
      lockComposer("First comment prompt is active. Write your first comment now.", false);
      setPhaseBanner("First comment opportunity is active.");
      els.commentInput.focus();
      logEvent("phase_enter", "first_comment_opportunity");
    }
  );
}

function submitParticipantComment() {
  if (state.phase !== PHASE.FIRST_OPPORTUNITY && state.phase !== PHASE.SECOND_OPPORTUNITY) return;

  const text = els.commentInput.value.trim();
  if (!text) return;

  const isFirst = state.phase === PHASE.FIRST_OPPORTUNITY;
  const id = `participant-${Date.now()}`;

  state.comments.push({
    id,
    author: `u/${state.username}`,
    timestamp: "just now",
    text,
    upvotes: 1,
    downvotes: 0,
    type: isFirst ? "first_participant" : "second_participant"
  });

  if (isFirst) {
    state.firstCommentId = id;
    logEvent("comment_submit", "first_comment", { textLength: text.length, id });
    setPhase(PHASE.FEEDBACK);
    lockComposer("Social feedback is now being delivered every 10 seconds.", true);
    setPhaseBanner("Step 6 in progress: feedback delivered every 10 seconds.");
    startSocialFeedback();
  } else {
    state.secondCommentId = id;
    logEvent("comment_submit", "second_comment", { textLength: text.length, id });
    setPhase(PHASE.COMPLETE);
    lockComposer("Second post submitted. This flow is complete.", true);
    setPhaseBanner("Experiment flow complete.");
    showModal(
      "Step 8 Complete",
      "Second posting opportunity completed. You can now export the log data.",
      "OK"
    );
  }

  els.commentInput.value = "";
  els.charCount.textContent = "0 / 500";
  persist();
  renderComments();
}

function startSocialFeedback() {
  clearTimers();
  state.feedbackMode = els.feedbackMode.value === "down" ? "down" : "up";
  state.feedbackTarget = Math.max(5, Number(els.feedbackCount.value) || 5);
  state.feedbackDelivered = 0;

  persist();
  renderStats();

  feedbackTimer = setInterval(() => {
    const delta = state.feedbackMode === "down" ? -1 : 1;
    deliverFeedback(delta);

    if (state.feedbackDelivered >= state.feedbackTarget) {
      clearInterval(feedbackTimer);
      feedbackTimer = null;
      launchManipulatedComments();
    }
  }, 10000);
}

function deliverFeedback(delta) {
  const target = state.comments.find((comment) => comment.id === state.firstCommentId);
  if (!target) return;

  if (delta > 0) {
    target.upvotes += 1;
    playUpvoteSound();
  } else {
    target.downvotes += 1;
  }

  state.feedbackDelivered += 1;

  const label = delta > 0 ? "You received +1 upvote" : "You received -1 downvote";
  showToast(label);

  logEvent("feedback_delivered", "first_comment", {
    delta,
    delivered: state.feedbackDelivered,
    target: state.feedbackTarget
  });

  persist();
  renderComments();
  renderStats();
}

function launchManipulatedComments() {
  setPhase(PHASE.NEW_POSTS);
  setPhaseBanner("Step 7 in progress: 5 additional comments appear every 5 seconds.");
  logEvent("phase_enter", "new_manipulated_posts");

  manipulatedIndex = 0;

  manipulatedTimer = setInterval(() => {
    const text = manipulatedComments[manipulatedIndex];

    state.comments.push({
      id: `manip-${Date.now()}-${manipulatedIndex}`,
      author: `u/DiscussionUser${manipulatedIndex + 1}`,
      timestamp: "just now",
      text,
      upvotes: (manipulatedIndex % 4) + 1,
      downvotes: 1,
      type: "manipulated"
    });

    logEvent("manipulated_comment_added", "thread", {
      index: manipulatedIndex + 1,
      textLength: text.length
    });

    manipulatedIndex += 1;
    persist();
    renderComments();

    if (manipulatedIndex >= 5) {
      clearInterval(manipulatedTimer);
      manipulatedTimer = null;
      openSecondOpportunity();
    }
  }, 5000);
}

function openSecondOpportunity() {
  setPhase(PHASE.SECOND_OPPORTUNITY);
  lockComposer("Second comment prompt is active. Write your second comment now.", true);
  showModal(
    "Step 8: Second Posting Opportunity",
    "Please make another post now.",
    "Write Second Comment",
    () => {
      lockComposer("Second comment prompt is active. Write your second comment now.", false);
      els.commentInput.focus();
      setPhaseBanner("Second comment opportunity is active.");
      logEvent("phase_enter", "second_comment_opportunity");
    }
  );
}

function renderAll() {
  renderPost();
  renderComments();
  renderStats();
  hydrateInputs();
}

function renderPost() {
  const main = document.createElement("div");
  main.className = "post-main";

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${state.post.subreddit} • Posted by ${state.post.author} • ${state.post.timestamp}`;

  const title = document.createElement("h1");
  title.className = "post-title";
  title.textContent = state.post.title;

  const body = document.createElement("p");
  body.className = "post-body";
  body.textContent = state.post.body;

  main.append(meta, title, body, createReactionBar(state.post.upvotes, state.post.downvotes));
  els.postCard.replaceChildren(main);
}

function renderComments() {
  const fragment = document.createDocumentFragment();

  state.comments.forEach((comment) => {
    const card = document.createElement("article");
    card.className = "comment-card";

    const main = document.createElement("div");
    main.className = "comment-main";

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `${comment.author} • ${comment.timestamp}`;

    const text = document.createElement("p");
    text.className = "comment-text";
    text.textContent = comment.text;

    main.append(meta, text, createReactionBar(comment.upvotes, comment.downvotes));
    card.append(main);
    fragment.append(card);
  });

  els.commentsList.replaceChildren(fragment);
}

function createReactionBar(upvotes, downvotes) {
  const bar = document.createElement("div");
  bar.className = "reaction-bar";

  const up = document.createElement("span");
  up.className = "reaction-chip up";
  up.textContent = `👍 ${upvotes}`;

  const down = document.createElement("span");
  down.className = "reaction-chip down";
  down.textContent = `👎 ${downvotes}`;

  bar.append(up, down);
  return bar;
}

function setPhase(phase) {
  state.phase = phase;
  persist();
  renderStats();
}

function setPhaseBanner(text) {
  els.phaseText.textContent = text;
}

function lockComposer(placeholder, lock = true) {
  els.commentInput.disabled = lock;
  els.commentInput.placeholder = placeholder;
  const submit = els.commentForm.querySelector("button[type='submit']");
  submit.disabled = lock;
}

function showModal(title, body, actionLabel = "Continue", onAction = null) {
  els.modalTitle.textContent = title;
  els.modalBody.textContent = body;
  els.modalAction.textContent = actionLabel;
  modalAction = onAction;
  els.modal.classList.add("open");
}

function closeModal() {
  els.modal.classList.remove("open");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2200);
}

function playUpvoteSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.08);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.14);
  } catch {
    // Ignore audio failures silently to avoid interrupting the experiment flow.
  }
}

function renderStats() {
  els.statPhase.textContent = `Phase: ${state.phase}`;
  els.statEvents.textContent = `Events: ${state.logs.length}`;
  els.statFeedback.textContent = `Feedback delivered: ${state.feedbackDelivered}/${state.feedbackTarget}`;
}

function hydrateInputs() {
  if (els.username) {
    els.username.value = state.username;
  }
  els.participantId.value = state.participantId;
  els.feedbackMode.value = state.feedbackMode;
  els.feedbackCount.value = String(state.feedbackTarget);
}

function sanitizeId(raw) {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
}

function sanitizeUsername(raw) {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
  return cleaned || "participant";
}

function logEvent(type, target, payload = {}) {
  state.logs.push({
    at: new Date().toISOString(),
    phase: state.phase,
    username: state.username,
    participantId: state.participantId,
    type,
    target,
    ...payload
  });
  persist();
  renderStats();
}

function exportData(asCsv) {
  const firstComment = state.comments.find((item) => item.type === "first_participant");
  const secondComment = state.comments.find((item) => item.type === "second_participant");

  const exportRow = {
    participantId: state.participantId || "",
    firstComment: firstComment ? firstComment.text : "",
    secondComment: secondComment ? secondComment.text : ""
  };

  const baseName = `reddit-flow-${state.participantId || "anon"}-${new Date().toISOString().slice(0, 10)}`;

  if (!asCsv) {
    downloadFile(`${baseName}.json`, JSON.stringify(exportRow, null, 2), "application/json");
    return;
  }

  const headers = ["participantId", "firstComment", "secondComment"];
  const rows = [
    headers.join(","),
    headers.map((key) => csvCell(exportRow[key])).join(",")
  ];

  downloadFile(`${baseName}.csv`, rows.join("\n"), "text/csv");
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function persist() {
  const payload = {
    username: state.username,
    participantId: state.participantId,
    feedbackMode: state.feedbackMode,
    feedbackTarget: state.feedbackTarget,
    logs: state.logs
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function hydrateFromStorage() {
  try {
    const onboardingRaw = localStorage.getItem(ONBOARDING_KEY);
    if (onboardingRaw) {
      const onboarding = JSON.parse(onboardingRaw);
      if (onboarding && typeof onboarding === "object") {
        state.username = sanitizeUsername(String(onboarding.username || ""));
        state.participantId = sanitizeId(String(onboarding.participantId || ""));
      }
    }
  } catch {}

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    state.username =
      typeof parsed.username === "string" ? sanitizeUsername(parsed.username) : state.username;
    state.participantId =
      typeof parsed.participantId === "string" ? sanitizeId(parsed.participantId) : state.participantId;
    state.feedbackMode = parsed.feedbackMode === "down" ? "down" : "up";
    state.feedbackTarget = Math.max(5, Number(parsed.feedbackTarget) || 5);
    state.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
  } catch {
    state.logs = [];
  }
}

function persistOnboarding() {
  const payload = {
    username: state.username,
    participantId: state.participantId,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(payload));
}

function clearTimers() {
  if (feedbackTimer) {
    clearInterval(feedbackTimer);
    feedbackTimer = null;
  }
  if (manipulatedTimer) {
    clearInterval(manipulatedTimer);
    manipulatedTimer = null;
  }
}

function hardReset() {
  clearTimers();
  state.phase = PHASE.FIRST_OPPORTUNITY;
  state.feedbackDelivered = 0;
  state.firstCommentId = "";
  state.secondCommentId = "";
  state.comments = cloneBaseComments();
  state.logs = [];

  persist();
  persistOnboarding();
  renderAll();
  startFlow();
}

init();
