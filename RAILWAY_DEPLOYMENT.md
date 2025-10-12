# 🚂 Railway Deployment Guide for TripSync

## ✅ Pre-Deployment Checklist

Your app is now **deployment-ready**! All hardcoded URLs have been replaced with environment variables.

---

## 📋 Step-by-Step Deployment

### 1. **Push to GitHub**

```bash
git add .
git commit -m "Prepare for Railway deployment - Add API URL config"
git push origin main
```

### 2. **Create Railway Account**

1. Go to [railway.app](https://railway.app)
2. Click "Start a New Project"
3. Sign up with GitHub

### 3. **Deploy Backend (Flask + MySQL)**

#### A. Create New Project from GitHub
1. Click "New Project" → "Deploy from GitHub repo"
2. Select your `TripSync` repository
3. Railway will auto-detect your Python app

#### B. Add MySQL Database
1. In your Railway project, click "+ New"
2. Select "Database" → "Add MySQL"
3. Railway will create a MySQL instance

#### C. Configure Environment Variables

Click on your Flask service → "Variables" tab → Add these:

```env
# Database (Auto-filled by Railway when you connect MySQL)
MYSQLHOST=<auto-filled>
MYSQLPORT=<auto-filled>
MYSQLUSER=<auto-filled>
MYSQLPASSWORD=<auto-filled>
MYSQLDATABASE=<auto-filled>

# Google Maps API
GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

# Python Environment
PYTHONUNBUFFERED=1
```

**Important:** Connect your MySQL database:
- Click "Variables" → "Add Reference Variables"
- Select your MySQL database
- Railway will auto-configure the connection

#### D. Set Start Command

In Railway service settings → "Deploy" tab:

**Start Command:**
```bash
python App.py
```

### 4. **Deploy Frontend (React)**

#### Option A: Same Railway Project (Recommended)

1. Railway auto-deploys both frontend and backend
2. After backend deploys, get its URL (e.g., `https://your-app.up.railway.app`)

#### Option B: Separate Vercel Frontend (if preferred)

1. Deploy React build to Vercel
2. Point `REACT_APP_API_URL` to Railway backend URL

### 5. **Configure Frontend Environment**

In Railway → Your Flask Service → Variables:

Add this **AFTER backend deploys**:

```env
REACT_APP_API_URL=https://your-backend-url.up.railway.app
```

Replace `your-backend-url` with your actual Railway backend URL.

### 6. **Initialize Database**

After deployment, you need to create your MySQL tables:

#### Option A: Use Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Connect to MySQL and run your schema
railway run mysql -h $MYSQLHOST -u $MYSQLUSER -p$MYSQLPASSWORD $MYSQLDATABASE < your_schema.sql
```

#### Option B: Use MySQL Workbench

1. In Railway, click your MySQL database
2. Click "Connect" → Get connection details
3. Connect with MySQL Workbench
4. Run your database schema/setup SQL

---

## 🎨 Local Development Setup

For local development, create a `.env` file in your root:

```env
REACT_APP_API_URL=http://localhost:5000
```

This keeps your local development unchanged!

---

## 🚀 Post-Deployment

### Test Your Deployment

1. Visit your Railway URL
2. Register a new account
3. Test core features:
   - ✅ Login/Register
   - ✅ Create Trip
   - ✅ Add Friends
   - ✅ Planner
   - ✅ Chat

### Monitor Your App

Railway Dashboard shows:
- 📊 Deployment logs
- 💾 Database metrics
- 🔍 Error tracking
- 💰 Usage statistics

---

## 🔧 Troubleshooting

### Build Fails

**Issue:** Python dependencies not installing
**Fix:** Add `requirements.txt`:

```bash
Flask==3.1.0
flask-cors==5.0.1
mysql-connector-python==9.2.0
googlemaps==4.10.0
python-dotenv==1.1.0
```

### Database Connection Errors

**Issue:** Can't connect to MySQL
**Fix:** 
1. Ensure MySQL service is running in Railway
2. Check environment variables are set
3. Verify database is initialized with tables

### API Calls Failing

**Issue:** Frontend can't reach backend
**Fix:**
1. Check `REACT_APP_API_URL` is set correctly
2. Rebuild frontend after setting env var
3. Verify CORS is enabled in Flask

---

## 💡 Tips

1. **Free Tier Limits**: Railway gives $5/month free credit
2. **Auto-Deploy**: Every push to `main` auto-deploys
3. **Environment Variables**: Change via Railway dashboard (no code changes needed)
4. **Logs**: Check Railway logs for debugging
5. **Custom Domain**: Add your own domain in Railway settings

---

## 📚 Next Steps

1. ✅ Deploy to Railway
2. 🧪 Test with friends
3. 📊 Monitor performance
4. 🔒 Add security (rate limiting, etc.)
5. 🎨 Gather feedback and iterate

---

## 🆘 Need Help?

- Railway Docs: https://docs.railway.app
- Railway Discord: Join for community support
- Your deployment is ready - just follow the steps above!

**Good luck with your demo! 🎉**

