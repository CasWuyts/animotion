const MODEL = "gemma4";
const GEN = "http://localhost:11434/api/generate";

const state = {
  step: 0,
  max: 0,
  answers: {},
  aiSummary: ""
};

const titles = [
  "Tell Animotion what you see in your head",
  "Check what Animotion understood",
  "Build it in After Effects"
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

init();

function init() {
  bindEvents();
  setDefaultAnswers();
  goToStep(0);
}

function bindEvents() {
  $$(".choices").forEach((grid) => {
    grid.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;

      grid.querySelectorAll("button").forEach((item) => {
        item.classList.remove("selected");
      });

      button.classList.add("selected");

      const key = grid.dataset.key;
      const otherInput = document.querySelector(`[data-other="${key}"]`);

      if (otherInput) {
        otherInput.hidden = button.dataset.value !== "other";
        if (!otherInput.hidden) otherInput.focus();
      }

      lockAfterStep(0);
    });
  });

  $$(".other, #context").forEach((input) => {
    input.addEventListener("input", () => lockAfterStep(0));
  });

  $("#back").addEventListener("click", () => {
    goToStep(state.step - 1);
  });

  $("#next").addEventListener("click", handleNext);

  $("#regen").addEventListener("click", async () => {
    if (!collectAnswers()) return;
    await generateBasicInterpretation();
  });

  $("#adjust").addEventListener("click", () => {
    goToStep(0);
  });

  $("#confirm").addEventListener("click", () => {
    renderRecipePlaceholder();
    unlockStep(2);
    goToStep(2);
  });

  $$(".step").forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.dataset.step);
      if (step <= state.max) goToStep(step);
    });
  });
}

function setDefaultAnswers() {
  const defaults = {
    objectType: "text",
    motionAction: "reveal from behind something",
    feeling: "smooth",
    startState: "behind a box or mask",
    endState: "visible in the center"
  };

  Object.entries(defaults).forEach(([key, value]) => {
    const button = document.querySelector(`.choices[data-key="${key}"] [data-value="${value}"]`);
    if (button) button.classList.add("selected");
  });
}

async function handleNext() {
  if (state.step === 0) {
    if (!collectAnswers()) return;

    unlockStep(1);
    goToStep(1);

    await generateBasicInterpretation();
    return;
  }

  if (state.step === 1) {
    renderRecipePlaceholder();
    unlockStep(2);
    goToStep(2);
  }
}

function goToStep(step) {
  if (step < 0 || step > 2 || step > state.max) return;

  state.step = step;

  $$(".panel").forEach((panel) => {
    panel.classList.toggle("active", Number(panel.dataset.panel) === step);
  });

  $$(".step").forEach((button) => {
    const buttonStep = Number(button.dataset.step);
    button.classList.toggle("active", buttonStep === step);
    button.disabled = buttonStep > state.max;
  });

  $("#kicker").textContent = `Step ${String(step + 1).padStart(2, "0")}`;
  $("#title").textContent = titles[step];
  $("#back").disabled = step === 0;
  $("#next").disabled = step === 2;
  $("#next").textContent = step === 0 ? "Continue" : "Continue to recipe";
}

function unlockStep(step) {
  state.max = Math.max(state.max, step);

  $$(".step").forEach((button) => {
    button.disabled = Number(button.dataset.step) > state.max;
  });
}

function lockAfterStep(step) {
  state.max = Math.min(state.max, step);

  $$(".step").forEach((button) => {
    button.disabled = Number(button.dataset.step) > state.max;
  });
}

function collectAnswers() {
  const keys = ["objectType", "motionAction", "feeling", "startState", "endState"];
  const answers = {};

  for (const key of keys) {
    const selected = document.querySelector(`.choices[data-key="${key}"] .selected`);
    let value = selected?.dataset.value || "";

    if (value === "other") {
      value = document.querySelector(`[data-other="${key}"]`).value.trim();
    }

    if (!value) {
      alert("Please answer every question. If you choose Other, fill it in.");
      return false;
    }

    answers[key] = value;
  }

  answers.extraContext = $("#context").value.trim();
  state.answers = answers;

  return true;
}

async function generateBasicInterpretation() {
  $("#summary").className = "result";
  $("#summary").innerHTML = `<p class="muted">Asking Gemma 4 what this animation probably means...</p>`;

  console.log("Gemma request started");

  $("#next").disabled = true;
  $("#regen").disabled = true;
  $("#confirm").disabled = true;

  try {
    const response = await fetch(GEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        prompt: basicInterpretationPrompt(state.answers),
        options: {
          temperature: 0.3
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama responded with status ${response.status}`);
    }

    const data = await response.json();

    state.aiSummary = data.response || "";

    console.log("Gemma connection works");
    console.log("Gemma response:", state.aiSummary);

    renderAISummary(state.aiSummary);
  } catch (error) {
    console.warn("Gemma connection failed:", error.message);
    renderFallbackSummary();
  }

  $("#next").disabled = false;
  $("#regen").disabled = false;
  $("#confirm").disabled = false;
}

function basicInterpretationPrompt(answers) {
  return `
You are Gemma 4 inside Animotion.

Animotion helps After Effects beginners explain animation ideas without using technical After Effects language.

The user answered these questions:
${JSON.stringify(answers, null, 2)}

Explain what animation the user probably wants.

Use this exact structure:

What I understood:
...

Likely animation:
...

Why:
...

In normal words:
...

Keep it short and beginner-friendly.
Do not use markdown.
Do not use emojis.
`;
}

function renderAISummary(text) {
  const cleaned = cleanAIText(text);

  $("#summary").className = "result";
  $("#summary").innerHTML = formatText(cleaned);
}

function renderFallbackSummary() {
  const answers = state.answers;

  $("#summary").className = "result";
  $("#summary").innerHTML = `
    <h4>What I understood</h4>
    <p>You want a ${escapeHTML(answers.objectType)} to ${escapeHTML(answers.motionAction)}.</p>

    <h4>Likely animation</h4>
    <p>${escapeHTML(guessTechnique(answers))}</p>

    <h4>Why</h4>
    <p>This matches the movement and feeling you selected.</p>

    <h4>In normal words</h4>
    <p>
      The ${escapeHTML(answers.objectType)} starts ${escapeHTML(answers.startState)},
      then ${escapeHTML(answers.motionAction)}, and ends ${escapeHTML(answers.endState)}
      with a ${escapeHTML(answers.feeling)} feeling.
    </p>
  `;
}

function guessTechnique(answers) {
  if (answers.motionAction.includes("reveal") || answers.startState.includes("behind")) {
    return "Masked reveal";
  }

  if (answers.motionAction.includes("pop") || answers.motionAction.includes("bounce")) {
    return "Pop-in animation";
  }

  if (answers.motionAction.includes("blur")) {
    return "Blur-to-focus reveal";
  }

  if (answers.motionAction.includes("draw")) {
    return "Draw-on animation";
  }

  if (answers.motionAction.includes("glitch")) {
    return "Glitch reveal";
  }

  return "Simple motion reveal";
}

function renderRecipePlaceholder() {
  const answers = state.answers;

  $("#recipe").className = "result";
  $("#recipe").innerHTML = `
    <h4>Temporary recipe preview</h4>
    <p>
      In a later version, this step will be generated with Gemma 4.
    </p>

    <h4>Current animation idea</h4>
    <p>
      You want a ${escapeHTML(answers.objectType)} to ${escapeHTML(answers.motionAction)}.
      It starts ${escapeHTML(answers.startState)} and ends ${escapeHTML(answers.endState)}.
      The feeling should be ${escapeHTML(answers.feeling)}.
    </p>
  `;
}

function cleanAIText(text) {
  return String(text || "")
    .replace(/#+\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .trim();
}

function formatText(text) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");

  return lines.map((line) => {
    const clean = line.trim();

    if (clean.endsWith(":")) {
      return `<h4>${escapeHTML(clean.replace(":", ""))}</h4>`;
    }

    return `<p>${escapeHTML(clean)}</p>`;
  }).join("");
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}