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
    userReaction: "",
    type: "seed"
  },
  {
    id: "seed-2",
    author: "u/FreeDebateAlways",
    timestamp: "2h",
    text: "I do not like hateful comments either, but heavy moderation can be abused quickly.",
    upvotes: 3,
    downvotes: 1,
    userReaction: "",
    type: "seed"
  },
  {
    id: "seed-3",
    author: "u/CommunityMod",
    timestamp: "1h",
    text: "Harassment is not debate. There should be clear penalties for repeated abuse.",
    upvotes: 2,
    downvotes: 1,
    userReaction: "",
    type: "seed"
  },
  {
    id: "seed-4",
    author: "u/AnonStudent22",
    timestamp: "1h",
    text: "Anonymous posting helps some vulnerable people speak. Removing it is risky.",
    upvotes: 1,
    downvotes: 1,
    userReaction: "",
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
    author: "u/ABCnews",
    timestamp: "2h",
    title: "Infant Formula Lawsuits Thrown Into Limbo After Strategic Corporate Split",
    body: `SilverVale Nutrition, a Texas-based infant formula manufacturer, is facing mounting public backlash after deploying a controversial corporate restructuring strategy known as the "Texas Two-Step" following a costly courtroom defeat.

Last autumn, a federal jury in Illinois found that SilverVale's specialized premature-infant formula, NeoNurture+, contributed to severe intestinal injuries in vulnerable newborns. Attorneys representing more than 3,800 families argued that internal testing data showed elevated risks but that the company failed to strengthen its warnings or reformulate the product. The jury awarded $312 million in damages in one bellwether case, opening the door to thousands of similar claims nationwide.

Among the plaintiffs are Daniel and Aisha Whitmore of Peoria, Illinois. Their son, Caleb Whitmore, was born at 29 weeks and fed NeoNurture+ while in the neonatal intensive care unit. At just three weeks old, Caleb developed a catastrophic intestinal condition that required emergency surgery. Portions of his intestine were removed. Now age five, he undergoes regular liver monitoring and immune function testing.

"They told us this was designed for fragile babies," Aisha Whitmore said outside the courthouse. "We trusted them completely. Instead, our son will face medical uncertainty for the rest of his life."

In the months that followed, thousands of additional claims were filed. Many parents reported that their children developed long-term complications, including compromised immune systems, liver dysfunction, and heightened cancer risks later in childhood. Pediatric specialists testified that early organ damage can create cascading health vulnerabilities that may not fully manifest for years.

But before most families could collect compensation, the corporation executed a complex corporate restructuring strategy commonly referred to as the Texas Two Step. The maneuver involves splitting the company into two separate entities under Texas law: one retains the profitable assets, while the other assumes the legal liabilities. The newly created entity then files for bankruptcy protection, halting pending lawsuits and forcing claimants into a prolonged bankruptcy process.

Legal experts say the strategy, while technically lawful, effectively shields the parent corporation's assets. "It allows a solvent company to isolate its liabilities and limit exposure," said one bankruptcy attorney familiar with the filings. "Families expecting timely compensation may now wait years."

"It's devastating," said Daniel Whitmore. "We fought for accountability, and now it feels like they've stepped sideways to avoid it." Meanwhile, SilverVale continues to report strong international sales of its other infant nutrition products.

For families like the Whitmores, the courtroom victory that once felt like justice now feels uncertain. "We're not looking for a windfall," Aisha said quietly. "We just want our son's medical future secured. And we want someone to admit what happened."

As bankruptcy proceedings unfold, thousands of parents remain in limbo, uncertain whether meaningful compensation or accountability will ever follow the verdict they once believed marked the end of their fight.`,
    upvotes: 4,
    downvotes: 1,
    userReaction: ""
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
let feedbackStartTimer = null;
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
    "First Comment Opportunity",
    "Please write your first comment now.",
    "Write First Comment",
    () => {
      lockComposer("First comment prompt is active. Write your first comment now.", false);
      setPhaseBanner("");
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
    upvotes: 0,
    downvotes: 0,
    userReaction: "",
    type: isFirst ? "first_participant" : "second_participant"
  });

  if (isFirst) {
    state.firstCommentId = id;
    logEvent("comment_submit", "first_comment", { textLength: text.length, id });
    setPhase(PHASE.FEEDBACK);
    lockComposer("Social feedback is now being delivered every 10 seconds.", true);
    setPhaseBanner("");
    startSocialFeedback();
  } else {
    state.secondCommentId = id;
    logEvent("comment_submit", "second_comment", { textLength: text.length, id });
    setPhase(PHASE.COMPLETE);
    lockComposer("Second post submitted. This flow is complete.", true);
    setPhaseBanner("Experiment flow complete.");
    autoExportOnComplete();
    showModal(
      "Study Complete",
      "Second posting opportunity completed. Your data has been downloaded automatically.",
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

  feedbackStartTimer = setTimeout(() => {
    const delta = state.feedbackMode === "down" ? -1 : 1;
    deliverFeedback(delta);

    if (state.feedbackDelivered >= state.feedbackTarget) {
      feedbackStartTimer = null;
      launchManipulatedComments();
      return;
    }

    feedbackStartTimer = null;
    feedbackTimer = setInterval(() => {
      const nextDelta = state.feedbackMode === "down" ? -1 : 1;
      deliverFeedback(nextDelta);

      if (state.feedbackDelivered >= state.feedbackTarget) {
        clearInterval(feedbackTimer);
        feedbackTimer = null;
        launchManipulatedComments();
      }
    }, 10000);
  }, 5000);
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
  setPhaseBanner("New comments are appearing every 5 seconds.");
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
      userReaction: "",
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
    "Second Posting Opportunity",
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
  meta.textContent = `Posted by ${state.post.author} • ${state.post.timestamp}`;

  const title = document.createElement("h1");
  title.className = "post-title";
  title.textContent = state.post.title;

  const body = document.createElement("p");
  body.className = "post-body";
  body.textContent = state.post.body;

  main.append(
    meta,
    title,
    body,
    createReactionBar(state.post.upvotes, state.post.downvotes, state.post.userReaction, (reaction) => {
      reactToPost(reaction);
    })
  );
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

    main.append(
      meta,
      text,
      createReactionBar(comment.upvotes, comment.downvotes, comment.userReaction, (reaction) => {
        reactToComment(comment.id, reaction);
      })
    );
    card.append(main);
    fragment.append(card);
  });

  els.commentsList.replaceChildren(fragment);
}

function createReactionBar(upvotes, downvotes, userReaction, onReact) {
  const bar = document.createElement("div");
  bar.className = "reaction-bar";

  const up = document.createElement("button");
  up.type = "button";
  up.className = `reaction-chip reaction-button up ${userReaction === "up" ? "active" : ""}`.trim();
  up.textContent = `👍 ${upvotes}`;
  up.addEventListener("click", () => onReact("up"));

  const down = document.createElement("button");
  down.type = "button";
  down.className = `reaction-chip reaction-button down ${userReaction === "down" ? "active" : ""}`.trim();
  down.textContent = `👎 ${downvotes}`;
  down.addEventListener("click", () => onReact("down"));

  bar.append(up, down);
  return bar;
}

function applyReaction(item, nextReaction) {
  const previous = item.userReaction || "";

  if (previous === nextReaction) {
    if (nextReaction === "up" && item.upvotes > 0) item.upvotes -= 1;
    if (nextReaction === "down" && item.downvotes > 0) item.downvotes -= 1;
    item.userReaction = "";
    return { previous, current: "" };
  }

  if (previous === "up" && item.upvotes > 0) item.upvotes -= 1;
  if (previous === "down" && item.downvotes > 0) item.downvotes -= 1;

  if (nextReaction === "up") item.upvotes += 1;
  if (nextReaction === "down") item.downvotes += 1;
  item.userReaction = nextReaction;

  return { previous, current: nextReaction };
}

function reactToPost(reaction) {
  const result = applyReaction(state.post, reaction);
  logEvent("reaction", "post", { previousReaction: result.previous, currentReaction: result.current });
  renderPost();
}

function reactToComment(commentId, reaction) {
  const comment = state.comments.find((item) => item.id === commentId);
  if (!comment) return;

  const result = applyReaction(comment, reaction);
  logEvent("reaction", `comment:${commentId}`, {
    previousReaction: result.previous,
    currentReaction: result.current
  });
  renderComments();
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

function autoExportOnComplete() {
  const firstComment = state.comments.find(
    (item) => item.type === "first_participant"
  );
  const secondComment = state.comments.find(
    (item) => item.type === "second_participant"
  );

  const payload = {
    participantId: state.participantId || "",
    firstComment: firstComment ? firstComment.text : "",
    secondComment: secondComment ? secondComment.text : "",
    logs: state.logs
  };

  fetch("https://script.google.com/macros/s/AKfycbxpBbDHq8r0HD1GtwAPjB4kNOzQIdqru9cGbpyhzvLEA0epM2Q1fv_JeEJb8Vf7MxB5kg/exec", {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
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
  let hasOnboardingProfile = false;

  try {
    const onboardingRaw = localStorage.getItem(ONBOARDING_KEY);
    if (onboardingRaw) {
      const onboarding = JSON.parse(onboardingRaw);
      if (onboarding && typeof onboarding === "object") {
        const onboardingUsername = sanitizeUsername(String(onboarding.username || ""));
        const onboardingParticipantId = sanitizeId(String(onboarding.participantId || ""));
        state.username = onboardingUsername;
        if (onboardingParticipantId) {
          state.participantId = onboardingParticipantId;
        }
        hasOnboardingProfile = true;
      }
    }
  } catch {}

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;

    if (!hasOnboardingProfile && typeof parsed.username === "string") {
      const parsedUsername = sanitizeUsername(parsed.username);
      if (parsedUsername) state.username = parsedUsername;
    }

    if (!hasOnboardingProfile && typeof parsed.participantId === "string") {
      const parsedParticipantId = sanitizeId(parsed.participantId);
      if (parsedParticipantId) state.participantId = parsedParticipantId;
    }
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
  if (feedbackStartTimer) {
    clearTimeout(feedbackStartTimer);
    feedbackStartTimer = null;
  }
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
