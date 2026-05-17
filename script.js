const MODEL = "gemma4";
const GEN = "http://localhost:11434/api/generate";

const state = {
  step: 0,
  max: 0,
  answers: {},
  preview: null,
  html: "",
  css: ""
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
    await generatePreview();
  });

  $("#replay").addEventListener("click", renderFrame);

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

    await generatePreview();
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
  $("#next").textContent = step === 0 ? "Generate preview" : "Continue to recipe";

  if (step === 1) renderFrame();
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

async function generatePreview() {
  $("#summary").className = "result";
  $("#summary").innerHTML = `<p class="muted">Generating a visual preview with Gemma 4...</p>`;

  $("#next").disabled = true;
  $("#regen").disabled = true;
  $("#confirm").disabled = true;

  console.log("Gemma CSS preview request started");

  try {
    const response = await fetch(GEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        prompt: previewPrompt(state.answers),
        options: {
          temperature: 0.25,
          top_p: 0.85
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama responded with status ${response.status}`);
    }

    const data = await response.json();

    console.log("Raw Gemma response:", data.response);

    const parsed = parseJSON(data.response);

    if (!parsed) {
      throw new Error("Gemma did not return valid JSON.");
    }

    state.preview = normalizePreview(parsed);
    state.html = state.preview.html;
    state.css = state.preview.css;

    renderSummary();
    renderFrame();

    console.log("CSS preview generated");
  } catch (error) {
    console.warn("CSS preview generation failed:", error.message);

    $("#summary").className = "result";
    $("#summary").innerHTML = `
      <h4>Preview could not be generated yet</h4>
      <p>
        The connection was made, but the generated preview was not usable yet.
        This will be handled better in a later version.
      </p>
    `;
  }

  $("#next").disabled = false;
  $("#regen").disabled = false;
  $("#confirm").disabled = false;
}

function previewPrompt(answers) {
  return `
You are Gemma 4 inside Animotion, an app for After Effects beginners.

The user knows what an animation should look like, but they do not know the technical After Effects words.

User answers:
${JSON.stringify(answers, null, 2)}

Your task:
Interpret the animation and generate actual HTML and CSS for a small visual preview.

Return ONLY valid JSON.
Do not use markdown.
Do not write anything outside the JSON.

JSON format:
{
  "understood": "one short normal sentence",
  "techniqueName": "likely animation name in simple words",
  "confidence": "High/Medium/Low",
  "whyThisTechnique": "short reason",
  "plainSummary": "normal-language summary",
  "html": "minimal HTML. Use wrapper class preview-scene and main object class anim-object. No script tags.",
  "css": "complete CSS with @keyframes. No external URLs/imports/scripts. The preview must auto-play. Duration 0.8s-2.5s. Fit inside 100vw/100vh."
}

Rules:
- Use CSS animation only.
- Do not use JavaScript.
- Do not use script tags.
- Do not use external files, URLs, imports, fonts or images.
- The HTML must include preview-scene.
- The HTML must include anim-object.
- The CSS must include @keyframes.
- If the idea is a reveal, show a mask-like window.
- If the idea is pop or bounce, use scale overshoot.
- If the idea is blur, animate filter blur.
- If the idea is draw itself, use a simple line or shape animation.
- If the idea is glitch, use quick opacity and translate changes.
- Make the movement clear enough for the user to confirm whether it matches their idea.
`;
}

function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text?.indexOf("{") ?? -1;
    const lastBrace = text?.lastIndexOf("}") ?? -1;

    if (firstBrace < 0 || lastBrace < 0) return null;

    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function normalizePreview(data) {
  return {
    understood: String(data.understood || "I understood your animation idea."),
    techniqueName: String(data.techniqueName || "Custom motion"),
    confidence: String(data.confidence || "Medium"),
    whyThisTechnique: String(data.whyThisTechnique || "Based on your answers."),
    plainSummary: String(data.plainSummary || data.understood || ""),
    html: safeHTML(String(data.html || "")),
    css: safeCSS(String(data.css || ""))
  };
}

function safeHTML(html) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/on\w+='[^']*'/gi, "");
}

function safeCSS(css) {
  return css
    .replace(/@import[^;]+;/gi, "")
    .replace(/url\((.*?)\)/gi, "none");
}

function renderSummary() {
  const preview = state.preview;

  $("#summary").className = "result";
  $("#summary").innerHTML = `
    <h4>What I understood</h4>
    <p>${escapeHTML(preview.understood)}</p>

    <h4>Likely animation</h4>
    <p><strong>${escapeHTML(preview.techniqueName)}</strong></p>

    <h4>Confidence</h4>
    <p>${escapeHTML(preview.confidence)}</p>

    <h4>Why</h4>
    <p>${escapeHTML(preview.whyThisTechnique)}</p>

    <h4>In normal words</h4>
    <p>${escapeHTML(preview.plainSummary)}</p>
  `;
}

function renderFrame() {
  const css = state.css || `
    body {
      margin: 0;
      height: 100vh;
      display: grid;
      place-items: center;
      font-family: system-ui;
      background: #f8fafc;
    }

    .preview-scene {
      width: 100vw;
      height: 100vh;
      display: grid;
      place-items: center;
    }

    .anim-object {
      padding: 20px 30px;
      border-radius: 20px;
      background: #7c3aed;
      color: white;
      font-weight: 900;
    }
  `;

  const html = state.html || `
    <div class="preview-scene">
      <div class="anim-object">Preview</div>
    </div>
  `;

  $("#frame").srcdoc = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          html,
          body {
            width: 100%;
            height: 100%;
            margin: 0;
          }

          ${css}
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `;
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

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}