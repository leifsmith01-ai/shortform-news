# 📁 Folder Setup Guide - Step by Step

## 🎯 Quick Setup (Copy-Paste Commands)

### **Option 1: Automated Setup (Recommended)**

```bash
# 1. Create your project folder
mkdir shortform-news
cd shortform-news

# 2. Create all directories
mkdir -p src/{api,lib,components/{ui,news},pages} public

# 3. Initialize npm
npm init -y

# 4. Now copy all files from the outputs folder to these locations (see mapping below)
```

---

### **Option 2: Manual Step-by-Step**

#### **Step 1: Create Project Root**
```bash
mkdir shortform-news
cd shortform-news
```

#### **Step 2: Create Directory Structure**
```bash
# Create src folder and subdirectories
mkdir -p src/api
mkdir -p src/lib
mkdir -p src/components/ui
mkdir -p src/components/news
mkdir -p src/pages

# Create public folder
mkdir -p public
```

#### **Step 3: Initialize npm**
```bash
npm init -y
```

---

## 📂 Final Folder Structure

Your project should look like this:

```
shortform-news/
├── public/
│   └── index.html                    # Copy from outputs/public/
│
├── src/
│   ├── api/
│   │   ├── index.ts                  # Copy from outputs/api/
│   │   ├── apiClient.ts              # Copy from outputs/api/
│   │   └── mockApiService.ts         # Copy from outputs/api/
│   │
│   ├── components/
│   │   ├── ui/                       # All UI components
│   │   │   ├── badge.tsx             # Copy from outputs/components/ui/
│   │   │   ├── button.tsx
│   │   │   ├── calendar.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── collapsible.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── select.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── toggle.tsx
│   │   │   └── toggle-group.tsx
│   │   │
│   │   ├── news/                     # News-specific components
│   │   │   ├── EmptyState.tsx        # Copy from outputs/components/news/
│   │   │   ├── FilterSidebar.tsx
│   │   │   ├── GroupedArticles.tsx
│   │   │   ├── LoadingCard.tsx
│   │   │   └── NewsCard.tsx
│   │   │
│   │   └── Layout.tsx                # Copy from outputs/components/
│   │
│   ├── lib/
│   │   └── utils.ts                  # Copy from outputs/lib/
│   │
│   ├── pages/
│   │   ├── Home.tsx                  # Copy from outputs/pages/
│   │   ├── SavedArticles.tsx
│   │   └── History.tsx
│   │
│   ├── App.tsx                       # Copy from outputs/src/
│   ├── main.tsx                      # Copy from outputs/src/
│   └── index.css                     # Copy from outputs/
│
├── .env.example                      # Copy from outputs/
├── .env                              # Create: cp .env.example .env
├── .gitignore                        # Copy from outputs/
├── package.json                      # Copy from outputs/
├── postcss.config.js                 # Copy from outputs/
├── tailwind.config.js                # Copy from outputs/
├── tsconfig.json                     # Create (see below)
├── vite.config.ts                    # Copy from outputs/
├── vercel.json                       # Copy from outputs/
├── deploy.sh                         # Copy from outputs/
│
└── docs/                             # Optional: organize documentation
    ├── README.md                     # Copy from outputs/
    ├── deployment-guide.md
    ├── API-CHANGES.md
    ├── PROJECT-STRUCTURE.md
    └── COMPLETE-FILE-LIST.md
```

---

## 🗺️ File Mapping (Where Each File Goes)

### **Root Directory Files**

| From outputs/ | To your project/ |
|---------------|------------------|
| `.env.example` | `.env.example` |
| `.gitignore` | `.gitignore` |
| `package.json` | `package.json` |
| `postcss.config.js` | `postcss.config.js` |
| `tailwind.config.js` | `tailwind.config.js` |
| `vite.config.ts` | `vite.config.ts` |
| `vercel.json` | `vercel.json` |
| `deploy.sh` | `deploy.sh` |
| `index.css` | `src/index.css` |

### **Documentation Files** (Optional - keep in root or docs/)

| From outputs/ | To your project/ |
|---------------|------------------|
| `README.md` | `README.md` or `docs/README.md` |
| `deployment-guide.md` | `docs/deployment-guide.md` |
| `API-CHANGES.md` | `docs/API-CHANGES.md` |
| `PROJECT-STRUCTURE.md` | `docs/PROJECT-STRUCTURE.md` |
| `COMPLETE-FILE-LIST.md` | `docs/COMPLETE-FILE-LIST.md` |

### **Source Files**

| From outputs/ | To your project/ |
|---------------|------------------|
| `src/App.tsx` | `src/App.tsx` |
| `src/main.tsx` | `src/main.tsx` |

### **API Files**

| From outputs/ | To your project/ |
|---------------|------------------|
| `api/index.ts` | `src/api/index.ts` |
| `api/apiClient.ts` | `src/api/apiClient.ts` |
| `api/mockApiService.ts` | `src/api/mockApiService.ts` |

### **Lib Files**

| From outputs/ | To your project/ |
|---------------|------------------|
| `lib/utils.ts` | `src/lib/utils.ts` |

### **Component Files**

| From outputs/ | To your project/ |
|---------------|------------------|
| `components/Layout.tsx` | `src/components/Layout.tsx` |
| `components/ui/*.tsx` (15 files) | `src/components/ui/*.tsx` |
| `components/news/*.tsx` (5 files) | `src/components/news/*.tsx` |

### **Page Files**

| From outputs/ | To your project/ |
|---------------|------------------|
| `pages/Home.tsx` | `src/pages/Home.tsx` |
| `pages/SavedArticles.tsx` | `src/pages/SavedArticles.tsx` |
| `pages/History.tsx` | `src/pages/History.tsx` |

### **Public Files**

| From outputs/ | To your project/ |
|---------------|------------------|
| `public/index.html` | `public/index.html` |

---

## 📋 Step-by-Step Copy Instructions

### **1. Set up the structure**
```bash
cd shortform-news
mkdir -p src/{api,lib,components/{ui,news},pages} public docs
```

### **2. Copy root config files**
```bash
# Assuming your outputs folder is at ~/Downloads/outputs/
cp ~/Downloads/outputs/.env.example .env.example
cp ~/Downloads/outputs/.gitignore .gitignore
cp ~/Downloads/outputs/package.json package.json
cp ~/Downloads/outputs/postcss.config.js postcss.config.js
cp ~/Downloads/outputs/tailwind.config.js tailwind.config.js
cp ~/Downloads/outputs/vite.config.ts vite.config.ts
cp ~/Downloads/outputs/vercel.json vercel.json
cp ~/Downloads/outputs/deploy.sh deploy.sh
chmod +x deploy.sh
```

### **3. Copy documentation**
```bash
cp ~/Downloads/outputs/*.md docs/
# Or keep README in root:
cp ~/Downloads/outputs/README.md README.md
```

### **4. Copy src files**
```bash
cp ~/Downloads/outputs/src/App.tsx src/
cp ~/Downloads/outputs/src/main.tsx src/
cp ~/Downloads/outputs/index.css src/
```

### **5. Copy API files**
```bash
cp ~/Downloads/outputs/api/* src/api/
```

### **6. Copy lib files**
```bash
cp ~/Downloads/outputs/lib/* src/lib/
```

### **7. Copy component files**
```bash
cp ~/Downloads/outputs/components/Layout.tsx src/components/
cp ~/Downloads/outputs/components/ui/* src/components/ui/
cp ~/Downloads/outputs/components/news/* src/components/news/
```

### **8. Copy page files**
```bash
cp ~/Downloads/outputs/pages/* src/pages/
```

### **9. Copy public files**
```bash
cp ~/Downloads/outputs/public/index.html public/
```

---

## 🔧 Additional Required File

You need to create `tsconfig.json` in the root:

```bash
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,

    /* Path mapping */
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF
```

And `tsconfig.node.json`:

```bash
cat > tsconfig.node.json << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
EOF
```

---

## ✅ Final Setup Steps

### **1. Create .env file**
```bash
cp .env.example .env
```

The .env file will have `VITE_USE_MOCK_API=true` by default, so the app will work immediately!

### **2. Install dependencies**
```bash
npm install
```

This will install all the packages from package.json.

### **3. Start development server**
```bash
npm run dev
```

### **4. Open browser**
Navigate to `http://localhost:5173`

---

## 🎨 Visual Directory Tree

After setup, run this to see your structure:

```bash
tree -L 3 -I 'node_modules'
```

You should see:
```
.
├── docs/
│   ├── API-CHANGES.md
│   ├── COMPLETE-FILE-LIST.md
│   ├── deployment-guide.md
│   └── PROJECT-STRUCTURE.md
├── public/
│   └── index.html
├── src/
│   ├── api/
│   │   ├── apiClient.ts
│   │   ├── index.ts
│   │   └── mockApiService.ts
│   ├── components/
│   │   ├── news/
│   │   ├── ui/
│   │   └── Layout.tsx
│   ├── lib/
│   │   └── utils.ts
│   ├── pages/
│   │   ├── History.tsx
│   │   ├── Home.tsx
│   │   └── SavedArticles.tsx
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── .env
├── .env.example
├── .gitignore
├── package.json
├── postcss.config.js
├── README.md
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

---

## 🚨 Common Issues & Solutions

### **Issue: Import errors with @/ paths**
**Solution:** Make sure `tsconfig.json` has the paths configuration and restart your editor/IDE.

### **Issue: Tailwind styles not working**
**Solution:** Make sure `index.css` is imported in `main.tsx` and contains the `@tailwind` directives.

### **Issue: Components not found**
**Solution:** Check that all files are in the correct folders. Use the file mapping table above.

### **Issue: npm install fails**
**Solution:** 
```bash
# Clear cache and try again
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### **Issue: Port 5173 already in use**
**Solution:**
```bash
# Kill process on port 5173
npx kill-port 5173
# Or use a different port
npm run dev -- --port 3000
```

---

## 📦 One-Line Setup Script

Here's a complete setup script you can run:

```bash
#!/bin/bash

# Create project
mkdir shortform-news && cd shortform-news

# Create directory structure
mkdir -p src/{api,lib,components/{ui,news},pages} public docs

# Copy files (adjust path to your outputs folder)
OUTPUTS_PATH="$HOME/Downloads/outputs"

# Root files
cp $OUTPUTS_PATH/{.env.example,.gitignore,package.json,postcss.config.js,tailwind.config.js,vite.config.ts,vercel.json,deploy.sh} .
cp $OUTPUTS_PATH/*.md docs/
cp $OUTPUTS_PATH/README.md .

# Source files
cp $OUTPUTS_PATH/src/* src/
cp $OUTPUTS_PATH/index.css src/
cp $OUTPUTS_PATH/api/* src/api/
cp $OUTPUTS_PATH/lib/* src/lib/
cp $OUTPUTS_PATH/components/Layout.tsx src/components/
cp $OUTPUTS_PATH/components/ui/* src/components/ui/
cp $OUTPUTS_PATH/components/news/* src/components/news/
cp $OUTPUTS_PATH/pages/* src/pages/
cp $OUTPUTS_PATH/public/index.html public/

# Create tsconfig.json files
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
EOF

cat > tsconfig.node.json << 'EOF'
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
EOF

# Setup environment
cp .env.example .env
chmod +x deploy.sh

# Install dependencies
npm install

echo "✅ Setup complete! Run 'npm run dev' to start development."
```

Save this as `setup.sh`, make it executable (`chmod +x setup.sh`), and run it!

---

## 🎯 You're Done!

After following these steps, you'll have a complete, working news aggregator. Just run:

```bash
npm run dev
```

And visit `http://localhost:5173` to see your app! 🎉
