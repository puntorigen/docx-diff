<p align="center">
  <img src="public/logo.png" alt="DocX Diff" width="120" />
</p>

<h1 align="center">DocX Diff</h1>

<p align="center">
  <strong>Compare Word Documents Online</strong><br>
  Upload two DOCX versions and see all differences with tracked changes
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License" />
</p>

---

## 📸 Preview

<!-- Replace with your recorded GIF -->
<p align="center">
  <img src="docs/demo.gif" alt="DocX Diff Demo" width="800" />
</p>

---

## ✨ Features

- 📄 **Upload & Compare** – Drop two DOCX files and see differences instantly
- 🔍 **Track Changes** – Insertions (green), deletions (red), format changes (yellow)
- ✅ **Accept/Reject** – Review changes individually via SuperDoc's bubble UI
- 🎨 **Format Detection** – Catches bold, italic, and other formatting changes
- 💾 **Download** – Export with tracked changes (MS Word compatible)
- 🛠️ **Full Editor** – SuperDoc toolbar for additional editing

---

## 🚀 Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 🛠️ Tech Stack

- **Next.js 16** – App Router
- **SuperDoc** – Document editor ([superdoc.dev](https://superdoc.dev))
- **diff-match-patch** – Character-level diffing
- **Tailwind CSS** – Styling
- **Zustand** – State management

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Project structure and data flow |
| [PLANS/final-approach.md](./PLANS/final-approach.md) | Detailed implementation guide |
| [PLANS/limitations.md](./PLANS/limitations.md) | Known limitations and workarounds |

---

## 📄 License

MIT © [Pablo Schaffner](https://pabloschaffner.com)
