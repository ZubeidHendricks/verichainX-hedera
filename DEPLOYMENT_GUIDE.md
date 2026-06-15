# VeriChainX Deployment Guide - TiDB 2025 & Hedera Hackathons

## 🚀 Quick Deployment (Railway - Recommended)

### Prerequisites
- GitHub account with VeriChainX repository
- Railway account (free at railway.app)
- TiDB Cloud account (already configured)
- OpenAI API key (already configured)

### Step 1: Deploy to Railway (3 minutes)
```bash
1. Visit https://railway.app
2. Sign up with GitHub
3. Click "Deploy from GitHub repo"
4. Select your VeriChainX repository
5. Railway automatically detects FastAPI application
6. Deployment starts immediately
```

### Step 2: Configure Environment Variables
```env
# In Railway dashboard > Environment tab, add these variables:

# TiDB Cloud (Critical) — use the values from your own TiDB Cloud cluster
TIDB_HOST=gateway01.<region>.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=<your-tidb-user>
TIDB_PASSWORD=<your-tidb-password>
TIDB_DATABASE=verichainx
TIDB_SSL_MODE=REQUIRED

# OpenAI API (Critical - Replace with your key)
OPENAI_API_KEY=your-openai-api-key-here

# Application Settings
PYTHONUNBUFFERED=1
ENVIRONMENT=production
DEBUG=false
HACKATHON_MODE=true
```

### Step 3: Custom Domain (Optional)
```bash
1. In Railway dashboard > Settings
2. Add custom domain: verichainx-demo.up.railway.app
3. SSL certificate automatically provisioned
4. Domain ready for hackathon judges
```

## 🏆 Professional Presentation URLs

After deployment, your hackathon submission will be available at:

- **API Documentation**: `https://verichainx-demo.up.railway.app/docs`
- **Health Check**: `https://verichainx-demo.up.railway.app/health`
- **Main Endpoint**: `https://verichainx-demo.up.railway.app/`
- **Analytics**: `https://verichainx-demo.up.railway.app/api/v1/analytics/dashboard`

## 🔧 Alternative: Render (Backup)

### Deploy to Render
```bash
1. Visit https://render.com
2. Connect GitHub repository
3. Choose "Web Service"
4. Configure:
   - Build Command: pip install -r requirements.txt
   - Start Command: uvicorn main_tidb:app --host 0.0.0.0 --port $PORT
   - Environment: Python 3.11
```

## 💰 Cost Analysis

### Railway (Primary)
- **Free Tier**: $5/month credits
- **Hackathon Usage**: ~$2-3 total
- **Cost**: FREE during hackathon period

### Render (Backup)
- **Free Tier**: 750 hours/month
- **Hackathon Usage**: 24/7 for 30 days = 720 hours
- **Cost**: FREE

## 🎯 Hackathon Judge Demo Script

### 1. API Overview
```bash
# Show system information
GET https://verichainx-demo.up.railway.app/

# Health check with TiDB connection status
GET https://verichainx-demo.up.railway.app/health
```

### 2. Product Analysis Demo
```json
POST https://verichainx-demo.up.railway.app/api/v1/products/analyze
{
    "product_name": "iPhone 14 Pro Max",
    "description": "Brand new iPhone 14 Pro Max 256GB Space Black",
    "price": 299.99,
    "category": "Electronics",
    "seller_info": {
        "name": "QuickDeals Store",
        "verified": false
    }
}
```

### 3. Analytics Dashboard
```bash
# Real-time analytics using TiDB HTAP
GET https://verichainx-demo.up.railway.app/api/v1/analytics/dashboard

# TiDB-specific capabilities
GET https://verichainx-demo.up.railway.app/api/v1/tidb/stats
```

## 🔍 Key Demo Points for Judges

### TiDB 2025 Hackathon
- **HTAP Capabilities**: Real-time analytics with TiFlash
- **Vector Search**: Built-in vector similarity search
- **Cloud Native**: TiDB Cloud Serverless integration
- **Scalability**: Horizontal scaling demonstration

### Hedera Hackathon  
- **Blockchain Integration**: Hedera testnet ready
- **Smart Contracts**: NFT minting preparation
- **Decentralized Trust**: Immutable audit trails
- **Hashgraph Consensus**: Fast, secure transactions

## 🚨 Troubleshooting

### Common Issues
1. **Database Connection Failed**
   - Verify TiDB environment variables
   - Check SSL requirements
   
2. **OpenAI API Errors**
   - Confirm API key validity
   - Check rate limits

3. **Port Issues**
   - Railway/Render automatically assign PORT
   - Application reads from environment

## 📈 Performance Optimization

### Production Settings
```python
# Already configured in main_tidb.py
- Connection pooling
- Error handling
- CORS enabled for demos
- Health checks
- Structured logging
```

## 🏅 Success Metrics

### Expected Performance
- **Response Time**: < 2 seconds for analysis
- **Availability**: 99.9% uptime during hackathon
- **Scalability**: Auto-scaling with traffic
- **Professional Appearance**: Custom domain with HTTPS

This deployment setup ensures your VeriChainX API is production-ready for hackathon evaluation with minimal setup time and maximum reliability.