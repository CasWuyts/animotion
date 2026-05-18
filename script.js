const MODEL = "gemma4";
const GEN = "http://localhost:11434/api/generate";

const state = {
  step: 0,
  max: 0,
  answers: {},
  preview: null,
  html: "",
  css: "",
  recipe: "",
  isLoading: false
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

  $("#confirm").addEventListener("click", async () => {
    unlockStep(2);
    goToStep(2);
    await generateRecipe();
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
    unlockStep(2);
    goToStep(2);
    await generateRecipe();
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
  $("#back").disabled = step === 0 || state.isLoading;
  $("#next").disabled = step === 2 || state.isLoading;
  $("#next").textContent = step === 0 ? "Generate preview" : "Continue to recipe";

  if (step === 1 && !state.isLoading) renderFrame();
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
  setLoading(true);
  clearWarning();
  loadingFrame();

  $("#summary").className = "result";
  $("#summary").innerHTML = `<p class="muted">Animotion is checking your answers and preparing the preview...</p>`;

  console.log("Gemma CSS preview request started");

  try {
    const response = await fetchWithTimeout(GEN, {
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
    }, 25000);

    if (!response.ok) {
      throw new Error(`Ollama responded with status ${response.status}`);
    }

    const data = await response.json();

    console.log("Raw Gemma response:", data.response);

    const parsed = parseJSON(data.response);

    if (!parsed) {
      throw new Error("Gemma did not return valid JSON.");
    }

    const preview = normalizePreview(parsed);
    const errors = validatePreview(preview);

    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }

    state.preview = preview;
    state.html = preview.html;
    state.css = preview.css;

    renderSummary();
    renderFrame();

    console.log("CSS preview generated");
  } catch (error) {
    console.warn("CSS preview generation failed:", error.message);

    state.preview = fallbackPreview();
    state.html = state.preview.html;
    state.css = state.preview.css;

    renderSummary();
    renderFrame();

    showWarning("Animotion used a simple backup preview because the generated preview was not usable yet.");
  }

  setLoading(false);
}

function fetchWithTimeout(url, options, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => {
    clearTimeout(timer);
  });
}

function setLoading(value) {
  state.isLoading = value;

  $("#loadingBox").hidden = !value;
  $("#next").disabled = value || state.step === 2;
  $("#back").disabled = value || state.step === 0;
  $("#regen").disabled = value;
  $("#confirm").disabled = value;
  $("#replay").disabled = value;

  $$(".step").forEach((button) => {
    button.disabled = value || Number(button.dataset.step) > state.max;
  });
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

function validatePreview(preview) {
  const errors = [];

  if (!preview.html.trim()) errors.push("missing HTML");
  if (!preview.css.trim()) errors.push("missing CSS");
  if (!preview.html.includes("preview-scene")) errors.push("missing preview-scene");
  if (!preview.html.includes("anim-object")) errors.push("missing anim-object");
  if (!preview.css.includes("@keyframes")) errors.push("missing keyframes");
  if (/<script/i.test(preview.html)) errors.push("script tag found");

  return errors;
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
    .replace(/url\((.*?)\)/gi, "none")
    .replace(/javascript:/gi, "");
}

function fallbackPreview() {
  const answers = state.answers;
  const label = escapeHTML(labelForObject(answers.objectType));
  const technique = guessTechnique(answers);

  let html = `
    <div class="preview-scene">
      <div class="anim-object">${label}</div>
    </div>
  `;

  let css = `
    body {
      margin: 0;
      font-family: system-ui, sans-serif;
    }

    .preview-scene {
      width: 100vw;
      height: 100vh;
      display: grid;
      place-items: center;
      overflow: hidden;
      background: radial-gradient(circle at center, #2d1b69, #111827);
    }

    .anim-object {
      padding: 22px 34px;
      border-radius: 24px;
      background: #7c3aed;
      color: white;
      font-size: clamp(1.8rem, 5vw, 4rem);
      font-weight: 950;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
      animation: fallbackMotion 1.4s ease-out forwards;
    }

    @keyframes fallbackMotion {
      from {
        opacity: 0;
        transform: translateY(34px) scale(0.92);
        filter: blur(10px);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
        filter: blur(0);
      }
    }
  `;

  if (answers.motionAction.includes("pop") || answers.motionAction.includes("bounce")) {
    css = `
      body {
        margin: 0;
        font-family: system-ui, sans-serif;
      }

      .preview-scene {
        width: 100vw;
        height: 100vh;
        display: grid;
        place-items: center;
        overflow: hidden;
        background: #111827;
      }

      .anim-object {
        padding: 22px 34px;
        border-radius: 24px;
        background: #7c3aed;
        color: white;
        font-size: clamp(1.8rem, 5vw, 4rem);
        font-weight: 950;
        animation: fallbackMotion 1.1s cubic-bezier(.2, 1.5, .4, 1) forwards;
      }

      @keyframes fallbackMotion {
        0% {
          opacity: 0;
          transform: scale(0.4);
        }

        70% {
          opacity: 1;
          transform: scale(1.12);
        }

        100% {
          opacity: 1;
          transform: scale(1);
        }
      }
    `;
  }

  if (answers.motionAction.includes("reveal") || answers.startState.includes("behind")) {
    html = `
      <div class="preview-scene">
        <div class="mask">
          <div class="anim-object">${label}</div>
        </div>
      </div>
    `;

    css = `
      body {
        margin: 0;
        font-family: system-ui, sans-serif;
      }

      .preview-scene {
        width: 100vw;
        height: 100vh;
        display: grid;
        place-items: center;
        overflow: hidden;
        background: #111827;
      }

      .mask {
        overflow: hidden;
        padding: 12px;
      }

      .anim-object {
        color: white;
        font-size: clamp(2rem, 6vw, 5rem);
        font-weight: 950;
        transform: translateY(110%);
        animation: fallbackMotion 1.3s ease-out forwards;
      }

      @keyframes fallbackMotion {
        from {
          opacity: 0;
          transform: translateY(110%);
        }

        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
  }

  if (answers.motionAction.includes("glitch")) {
    css = `
      body {
        margin: 0;
        font-family: system-ui, sans-serif;
      }

      .preview-scene {
        width: 100vw;
        height: 100vh;
        display: grid;
        place-items: center;
        overflow: hidden;
        background: #050816;
      }

      .anim-object {
        padding: 22px 34px;
        border-radius: 18px;
        border: 2px solid #a78bfa;
        color: white;
        font-size: clamp(1.8rem, 5vw, 4rem);
        font-weight: 950;
        letter-spacing: 0.08em;
        animation: fallbackMotion 1.2s steps(2, end) forwards;
      }

      @keyframes fallbackMotion {
        0% {
          opacity: 0;
          transform: translateX(-20px);
          filter: blur(6px);
        }

        20% {
          opacity: 1;
          transform: translateX(18px);
          filter: blur(0);
        }

        40% {
          opacity: 0.4;
          transform: translateX(-12px);
        }

        65% {
          opacity: 1;
          transform: translateX(8px);
        }

        100% {
          opacity: 1;
          transform: translateX(0);
          filter: blur(0);
        }
      }
    `;
  }

  return {
    understood: `You want a ${answers.objectType} to ${answers.motionAction}.`,
    techniqueName: technique,
    confidence: "Medium",
    whyThisTechnique: "This backup animation matches the movement and feeling you selected.",
    plainSummary: `The ${answers.objectType} starts ${answers.startState}, then ${answers.motionAction}, and ends ${answers.endState}.`,
    html,
    css
  };
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

function labelForObject(objectType) {
  if (objectType.includes("logo")) return "LOGO";
  if (objectType.includes("button")) return "Button";
  if (objectType.includes("shape")) return "Shape";
  if (objectType.includes("transition")) return "WIPE";
  if (objectType.includes("image")) return "Image";
  return "Title";
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

function loadingFrame() {
  $("#frame").srcdoc = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            margin: 0;
            width: 100vw;
            height: 100vh;
            display: grid;
            place-items: center;
            font-family: system-ui, sans-serif;
            background: #fbfaff;
            color: #5b21b6;
          }

          .loading {
            text-align: center;
            font-weight: 900;
          }

          .dot {
            width: 54px;
            height: 54px;
            margin: 0 auto 18px;
            border-radius: 999px;
            background: #7c3aed;
            animation: pulse 1s ease-in-out infinite alternate;
          }

          @keyframes pulse {
            from {
              transform: scale(0.78);
              opacity: 0.5;
            }

            to {
              transform: scale(1);
              opacity: 1;
            }
          }
        </style>
      </head>

      <body>
        <div class="loading">
          <div class="dot"></div>
          Building preview...
        </div>
      </body>
    </html>
  `;
}

function showWarning(message) {
  $("#warning").hidden = false;
  $("#warning").textContent = message;
}

function clearWarning() {
  $("#warning").hidden = true;
  $("#warning").textContent = "";
}

async function generateRecipe() {
  setRecipeLoading(true);

  $("#recipe").className = "result";
  $("#recipe").innerHTML = `
    <p class="muted">
      Gemma 4 is turning the preview into After Effects steps...
    </p>
  `;

  console.log("Gemma After Effects recipe request started");

  try {
    const response = await fetchWithTimeout(GEN, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        prompt: recipePrompt(state.answers, state.preview),
        options: {
          temperature: 0.35,
          top_p: 0.9
        }
      })
    }, 30000);

    if (!response.ok) {
      throw new Error(`Ollama responded with status ${response.status}`);
    }

    const data = await response.json();

    state.recipe = cleanRecipeText(data.response || "");

    if (!state.recipe.trim()) {
      throw new Error("Gemma returned an empty recipe.");
    }

    renderRecipe(state.recipe);

    console.log("After Effects recipe generated");
    console.log("Recipe response:", state.recipe);
  } catch (error) {
    console.warn("Recipe generation failed:", error.message);

    state.recipe = fallbackRecipe();
    renderRecipe(state.recipe);
  }

  setRecipeLoading(false);
}

function recipePrompt(answers, preview) {
  return `
You are Gemma 4 inside Animotion.

Animotion helps After Effects beginners turn a visual animation idea into clear After Effects steps.

The user answered:
${JSON.stringify(answers, null, 2)}

Animotion understood the animation as:
${JSON.stringify(preview, null, 2)}

Now explain how to recreate this animation in Adobe After Effects.

Use this exact structure:

1. Animation name
2. In normal words
3. After Effects tools needed
4. Step-by-step build instructions
5. Suggested keyframes
6. Easing and timing advice
7. Common beginner mistake

Rules:
- Write for a beginner.
- Keep it practical.
- Do not use markdown.
- Do not use hashtags.
- Do not use emojis.
- Do not use asterisks.
- Do not mention CSS.
- Explain the animation in After Effects terms, but keep the language simple.
`;
}

function fallbackRecipe() {
  const answers = state.answers;
  const technique = guessTechnique(answers);

  return `
1. Animation name
${technique}

2. In normal words
The ${answers.objectType} starts ${answers.startState}, then ${answers.motionAction}, and ends ${answers.endState}. The animation should feel ${answers.feeling}.

3. After Effects tools needed
Shape layer or text layer
Transform properties
Position
Scale
Opacity
Easy Ease
Graph Editor

4. Step-by-step build instructions
Create the layer you want to animate.
Place it in its final position first.
Move the playhead to the start of the animation.
Set the starting values based on the idea, for example lower opacity, smaller scale or a position outside the screen.
Add keyframes for the starting values.
Move the playhead forward by about one second.
Set the final values so the object is visible and in the correct position.
Select the keyframes and apply Easy Ease.

5. Suggested keyframes
At 0 seconds: start position, lower opacity or smaller scale.
At 1 second: final position, full opacity and normal scale.
For a smoother result, add a small overshoot before the final keyframe if the animation should feel playful.

6. Easing and timing advice
Use Easy Ease to make the movement feel less robotic.
For a smooth animation, keep the duration around 1 to 1.5 seconds.
For a fast animation, keep it closer to 0.6 to 0.8 seconds.
Use the Graph Editor to make the movement start fast and slow down near the end.

7. Common beginner mistake
A common mistake is making the animation too slow or too linear. Without easing, the movement can feel mechanical instead of natural.
`;
}

function renderRecipe(text) {
  $("#recipe").className = "result";
  $("#recipe").innerHTML = formatRecipeText(text);
}

function cleanRecipeText(text) {
  return String(text || "")
    .replace(/#+\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/```/g, "")
    .trim();
}

function formatRecipeText(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    if (/^\d+\.\s/.test(line)) {
      return `<h4>${escapeHTML(line)}</h4>`;
    }

    return `<p>${escapeHTML(line)}</p>`;
  }).join("");
}

function setRecipeLoading(value) {
  state.isLoading = value;

  $("#back").disabled = value;
  $("#next").disabled = true;

  $$(".step").forEach((button) => {
    button.disabled = value || Number(button.dataset.step) > state.max;
  });
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}