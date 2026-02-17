# 🌐 Hosting Guide - Where & How to Deploy Your News Aggregator

## 🎯 Best Hosting Options (Ranked)

### **Option 1: Vercel (⭐ RECOMMENDED - Easiest & Free)**

**Why Vercel?**
- ✅ **FREE tier is generous** (100GB bandwidth, unlimited projects)
- ✅ **Automatic HTTPS** (free SSL certificates)
- ✅ **Global CDN** (fast worldwide)
- ✅ **Zero configuration** for Vite/React apps
- ✅ **GitHub integration** (auto-deploy on push)
- ✅ **Custom domains** included for free
- ✅ **Environment variables** in dashboard
- ✅ **Instant rollbacks**

**Perfect for:** Production apps, personal projects, startups

**Cost:** 
- Free: Hobby projects
- $20/month: Pro (for commercial use)

---

### **Option 2: Netlify (Great Alternative)**

**Why Netlify?**
- ✅ **FREE tier** (100GB bandwidth, 300 build minutes/month)
- ✅ **Automatic HTTPS**
- ✅ **Global CDN**
- ✅ **Form handling** (useful if you add contact forms)
- ✅ **Serverless functions** support
- ✅ **Split testing** (A/B testing built-in)

**Perfect for:** Projects with forms, A/B testing needs

**Cost:**
- Free: Personal projects
- $19/month: Pro

---

### **Option 3: Cloudflare Pages (Most Affordable)**

**Why Cloudflare?**
- ✅ **UNLIMITED bandwidth** on free tier!
- ✅ **Unlimited requests**
- ✅ **Fastest CDN** in the world
- ✅ **Built-in analytics**
- ✅ **Web analytics** without tracking

**Perfect for:** High-traffic sites, privacy-focused projects

**Cost:**
- Free: Unlimited (truly!)
- $20/month: Only if you need advanced features

---

### **Option 4: GitHub Pages (100% Free)**

**Why GitHub Pages?**
- ✅ **Completely FREE**
- ✅ **Direct from GitHub repo**
- ✅ **Custom domains** supported
- ✅ **Simple setup**

**Limitations:**
- ❌ No server-side rendering
- ❌ Manual deployment process
- ❌ Limited to static sites
- ❌ No built-in environment variables

**Perfect for:** Open-source projects, portfolios, documentation

**Cost:** FREE forever

---

### **Option 5: AWS Amplify (If You're on AWS)**

**Why AWS Amplify?**
- ✅ **Full AWS integration**
- ✅ **Scales automatically**
- ✅ **Custom domains** included
- ✅ **Good for enterprise**

**Perfect for:** If you're already using AWS services

**Cost:**
- ~$0.01 per build minute
- ~$0.15 per GB served
- Usually ~$5-20/month for small apps

---

### **Option 6: Self-Hosted VPS (Full Control)**

**Platforms:** DigitalOcean, Linode, Vultr, AWS EC2

**Why Self-Host?**
- ✅ **Complete control**
- ✅ **Can run backend on same server**
- ✅ **SSH access**
- ✅ **Custom configurations**

**Perfect for:** Developers who want full control, apps with backends

**Cost:**
- $4-6/month: Basic VPS
- $12+/month: Production VPS

---

## 🚀 Deployment Instructions

### **OPTION 1: Deploy to Vercel (5 minutes)**

#### **Method A: Using Vercel CLI (Fastest)**

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Navigate to your project
cd shortform-news

# 3. Deploy!
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Your account
# - Link to existing project? No
# - What's your project's name? shortform-news
# - In which directory is your code located? ./
# - Want to override settings? No

# 4. Your site is live! You'll get a URL like:
# https://shortform-news-abc123.vercel.app
```

#### **Method B: Using Vercel Dashboard (More Control)**

1. **Push code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/shortform-news.git
   git push -u origin main
   ```

2. **Go to [vercel.com](https://vercel.com)**
   - Sign up with GitHub
   - Click "New Project"
   - Import your GitHub repository
   - Vercel auto-detects Vite settings
   - Click "Deploy"

3. **Add environment variables:**
   - Go to Project Settings → Environment Variables
   - Add:
     - `VITE_USE_MOCK_API` = `true` (or `false` if you have a backend)
     - `VITE_API_URL` = `your-backend-url` (if using real API)
     - `VITE_API_KEY` = `your-api-key` (if using real API)

4. **Your site is live!**
   - You get a URL like: `https://shortform-news.vercel.app`
   - Add custom domain in Settings → Domains

---

### **OPTION 2: Deploy to Netlify**

#### **Method A: Netlify CLI**

```bash
# 1. Install Netlify CLI
npm install -g netlify-cli

# 2. Build your app
npm run build

# 3. Deploy
netlify deploy

# 4. For production
netlify deploy --prod

# Follow prompts to create new site or link existing one
```

#### **Method B: Netlify Dashboard**

1. **Build your app:**
   ```bash
   npm run build
   ```

2. **Go to [netlify.com](https://netlify.com)**
   - Sign up
   - Drag and drop your `dist` folder
   - OR connect GitHub repo

3. **Configure:**
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Add environment variables in Site Settings

4. **Your site is live!**
   - You get: `https://your-site-name.netlify.app`

---

### **OPTION 3: Deploy to Cloudflare Pages**

#### **Using Cloudflare Dashboard**

1. **Push to GitHub** (same as Vercel method)

2. **Go to [pages.cloudflare.com](https://pages.cloudflare.com)**
   - Sign up
   - Click "Create a project"
   - Connect to GitHub
   - Select your repository

3. **Configure build:**
   - Framework preset: Vite
   - Build command: `npm run build`
   - Build output directory: `dist`

4. **Add environment variables:**
   - In Pages project settings
   - Add your `VITE_*` variables

5. **Deploy!**
   - You get: `https://shortform-news.pages.dev`

---

### **OPTION 4: Deploy to GitHub Pages**

```bash
# 1. Install gh-pages
npm install --save-dev gh-pages

# 2. Add to package.json scripts:
"scripts": {
  "predeploy": "npm run build",
  "deploy": "gh-pages -d dist"
}

# 3. Update vite.config.ts:
export default defineConfig({
  base: '/shortform-news/', // Your repo name
  // ... rest of config
})

# 4. Deploy
npm run deploy

# Your site will be at:
# https://yourusername.github.io/shortform-news/
```

---

### **OPTION 5: Self-Host on VPS (DigitalOcean Example)**

#### **Step 1: Create Droplet**
- Go to [digitalocean.com](https://digitalocean.com)
- Create Ubuntu 24.04 droplet ($6/month)
- Get IP address (e.g., `123.456.789.0`)

#### **Step 2: SSH into Server**
```bash
ssh root@123.456.789.0
```

#### **Step 3: Install Dependencies**
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Nginx
apt install -y nginx

# Install PM2 (process manager)
npm install -g pm2
```

#### **Step 4: Upload Your App**
```bash
# On your local machine:
npm run build

# Upload to server:
scp -r dist/* root@123.456.789.0:/var/www/shortform-news/
```

#### **Step 5: Configure Nginx**
```bash
# On server:
nano /etc/nginx/sites-available/shortform-news
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # or use IP
    root /var/www/shortform-news;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    
    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/shortform-news /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

#### **Step 6: Add SSL (Free with Let's Encrypt)**
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

Your site is now live at `https://your-domain.com`!

---

## 🌍 Custom Domain Setup

### **For Vercel/Netlify/Cloudflare:**

1. **Buy domain** (Namecheap, Google Domains, Cloudflare)

2. **Add domain to hosting platform:**
   - Vercel: Settings → Domains → Add
   - Netlify: Site Settings → Domain Management
   - Cloudflare Pages: Custom Domains

3. **Update DNS records** (at your domain registrar):
   ```
   Type: CNAME
   Name: www
   Value: your-app.vercel.app (or netlify/cloudflare URL)
   
   Type: A (for root domain)
   Name: @
   Value: [IP provided by host]
   ```

4. **Wait for DNS propagation** (5 mins - 24 hours)

5. **SSL auto-generated** by all platforms!

---

## 💰 Cost Comparison (Monthly)

| Platform | Free Tier | Paid Tier | Best For |
|----------|-----------|-----------|----------|
| **Vercel** | 100GB bandwidth | $20/mo (Pro) | Most projects ⭐ |
| **Netlify** | 100GB bandwidth | $19/mo (Pro) | Forms, functions |
| **Cloudflare Pages** | UNLIMITED | $20/mo (Workers) | High traffic 🚀 |
| **GitHub Pages** | 100GB bandwidth | FREE only | Open source |
| **AWS Amplify** | Pay-as-you-go | ~$5-30/mo | AWS integration |
| **DigitalOcean** | None | $6-12/mo | Full control |

---

## 🎯 Recommendation Based on Use Case

### **For Your News Aggregator Specifically:**

#### **Scenario 1: Just the Frontend (Mock API)**
**Recommended: Vercel or Cloudflare Pages**
- Deploy frontend only
- Use mock API (`VITE_USE_MOCK_API=true`)
- **Cost: FREE**
- **Time: 5 minutes**

#### **Scenario 2: Frontend + Backend (Future)**
**Recommended: Vercel (frontend) + Railway/Render (backend)**

**Frontend on Vercel:**
```bash
# Deploy frontend
vercel
# Set VITE_USE_MOCK_API=false
# Set VITE_API_URL=https://your-backend.railway.app/api
```

**Backend Options:**
- Railway.app: Node.js/Python backend ($5/mo)
- Render.com: Free tier available
- Fly.io: Free tier available

#### **Scenario 3: Everything on One Server**
**Recommended: DigitalOcean or Linode**
- $6/month droplet
- Host frontend (Nginx)
- Host backend (Node.js/Python)
- Host database (PostgreSQL/MongoDB)

---

## 🚀 Quick Start Recommendations

### **If you want it live NOW (5 minutes):**
```bash
cd shortform-news
vercel
```

### **If you want it free FOREVER:**
- Use **Cloudflare Pages** (unlimited bandwidth!)
- Or **GitHub Pages** (simple but limited)

### **If you're building a business:**
- Use **Vercel Pro** ($20/mo) - best DX
- Or **Cloudflare Pages** (cheaper for high traffic)

### **If you want full control:**
- Get a **DigitalOcean droplet** ($6/mo)
- Set up Nginx + Node.js

---

## 📊 Feature Comparison

| Feature | Vercel | Netlify | Cloudflare | GitHub Pages | VPS |
|---------|--------|---------|------------|--------------|-----|
| Free SSL | ✅ | ✅ | ✅ | ✅ | Manual |
| Custom Domain | ✅ | ✅ | ✅ | ✅ | ✅ |
| Auto Deploy | ✅ | ✅ | ✅ | ❌ | ❌ |
| Environment Vars | ✅ | ✅ | ✅ | ❌ | ✅ |
| Build Minutes | Unlimited | 300/mo | 500/mo | N/A | Unlimited |
| Bandwidth | 100GB | 100GB | Unlimited | 100GB | Based on plan |
| Setup Time | 5 min | 5 min | 10 min | 15 min | 30-60 min |

---

## 🎬 Next Steps

1. **Choose your platform** (I recommend Vercel)

2. **Deploy the frontend:**
   ```bash
   vercel
   ```

3. **Your app is live!** Share the URL

4. **Later, when you build your backend:**
   - Deploy backend separately (Railway, Render)
   - Update `VITE_API_URL` in Vercel
   - Turn off mock API (`VITE_USE_MOCK_API=false`)

---

## 🆘 Troubleshooting

### **"Build failed on Vercel"**
- Check build logs
- Ensure `package.json` has correct build script
- Verify all dependencies are listed

### **"Environment variables not working"**
- Must start with `VITE_` (not `REACT_APP_`)
- Redeploy after adding variables
- Check they're set in platform dashboard

### **"404 on refresh"**
- Add `vercel.json` (already provided!)
- For Netlify: add `_redirects` file with `/* /index.html 200`

### **"Images not loading"**
- Check CORS settings
- Verify image URLs are valid
- Check network tab in browser DevTools

---

## 🎉 You're Ready to Deploy!

Pick a platform and follow the instructions. **Vercel** is the easiest - you'll have your site live in 5 minutes! 🚀
