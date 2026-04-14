# BreakabilityChart AI Scanner Roadmap

This file captures the multi-step plan for the upcoming AI scanner workflow.

**Step 1: Settings & Provider Architecture**
- Add a Settings drawer/modal for provider selection (Ollama/OpenAI), endpoint, and credentials.
- Persist settings to local storage so the endpoint does not need re-entry.

**Step 2: Capture & Processing Engine**
- Port the MediaStream capture flow from Pitipen.
- Build a `Scanner` component that takes a snip and returns a Base64 image string.

**Step 3: Multi-AI Bridge (API Wrapper)**
- Create `aiClient.ts` (or equivalent) to send Base64 images to Ollama or cloud APIs.
- Return a clean JSON object with mass and resistance.

**Step 4: Data Integration & Reactive Charting**
- Connect scanner output to the Breakability chart.
- Update mass/resistance sliders automatically after each scan.

**Step 5: Location & Metadata Layer**
- Add a location selector and a Log Scan button.
- Bundle Mass, Resistance, Location, and Timestamp into a single object for future logging.
