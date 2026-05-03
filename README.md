# Azure Speech (Static Website)

This folder is a **HTML/CSS/JS-only** demo for:

- Speech-to-text (microphone → transcript)
- Text-to-speech (text → speakers)

## Run locally

Microphone access works best on a secure origin. `localhost` is treated as secure by modern browsers.

From the repo root:

```powershell
cd speechservices/web
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Use it

1. In the page, enter your **Speech key** and **Region** and click **Save**.
2. Use **Speech → Text** to start/stop microphone recognition.
3. Use **Text → Speech** to synthesize and play audio.

## Security note

Putting an Azure Speech subscription key in browser code exposes it to any user of the page.
For production, use a backend to mint short-lived auth tokens and call Speech with `authorizationToken` instead of `subscription key`.

