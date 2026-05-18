Animotion is a local AI prototype that helps After Effects beginners describe and understand animation ideas.

The idea is simple: a beginner often knows what an animation should look like, but does not always know the correct After Effects terms. Animotion asks simple visual questions, translates those answers into a CSS animation preview, and then explains how to recreate the animation in After Effects.

What the app does

1. The user answers simple questions about the animation.
2. Gemma 4 interprets the answers through Ollama.
3. Animotion generates a small CSS animation preview.
4. The user checks if the preview matches the idea.
5. After confirmation, Gemma 4 generates beginner-friendly After Effects steps.

Technologies used

- HTML
- CSS
- JavaScript
- Ollama
- Gemma 4
- Local browser-based prototype

Sources used : 
- Ollama documentation — Quickstart and installation  
  Used to understand how Ollama runs local models and how to start using it.  
  https://docs.ollama.com/quickstart

- Ollama documentation — API generate endpoint  
  Used for the `/api/generate` request, including `model`, `prompt` and `stream: false`.  
  https://docs.ollama.com/api/generate

- Ollama documentation — API introduction  
  Used for the local API base URL: `http://localhost:11434/api`.  
  https://docs.ollama.com/api/introduction

- Ollama documentation — FAQ / environment variables  
  Used for information about configuring Ollama with environment variables such as `OLLAMA_ORIGINS`.  
  https://docs.ollama.com/faq

- Google AI for Developers — Gemma documentation  
  Used as background information about Gemma as a family of lightweight open models.  
  https://ai.google.dev/gemma/docs

- Google DeepMind — Gemma model page  
  Used as general background about Gemma models running on personal computers and local devices.  
  https://deepmind.google/models/gemma/