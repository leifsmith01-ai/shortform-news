#!/bin/bash

# Shortform News Aggregator - Quick Deploy Script
# This script helps you deploy your news aggregator to various platforms

set -e

echo "🚀 Shortform News Aggregator - Deployment Helper"
echo "================================================"
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit: Shortform News Aggregator"
fi

echo "Select your deployment platform:"
echo "1) Vercel (Recommended)"
echo "2) Netlify"
echo "3) AWS Amplify"
echo "4) Manual Setup"
echo ""
read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🔵 Deploying to Vercel..."
        echo "========================="
        
        # Check if Vercel CLI is installed
        if ! command -v vercel &> /dev/null; then
            echo "Installing Vercel CLI..."
            npm install -g vercel
        fi
        
        echo ""
        echo "📝 Before deploying, make sure you have:"
        echo "  - Created a Vercel account at https://vercel.com"
        echo "  - Have your API keys ready for environment variables"
        echo ""
        read -p "Press Enter to continue..."
        
        vercel
        
        echo ""
        echo "✅ Deployment complete!"
        echo "🔧 Don't forget to add environment variables in Vercel dashboard:"
        echo "   - REACT_APP_API_URL"
        echo "   - REACT_APP_API_KEY"
        ;;
        
    2)
        echo ""
        echo "🟢 Deploying to Netlify..."
        echo "=========================="
        
        # Check if Netlify CLI is installed
        if ! command -v netlify &> /dev/null; then
            echo "Installing Netlify CLI..."
            npm install -g netlify-cli
        fi
        
        echo ""
        echo "Building your application..."
        npm run build
        
        echo ""
        echo "📝 Before deploying, make sure you have:"
        echo "  - Created a Netlify account at https://netlify.com"
        echo "  - Have your API keys ready"
        echo ""
        read -p "Press Enter to continue..."
        
        netlify deploy --prod
        
        echo ""
        echo "✅ Deployment complete!"
        ;;
        
    3)
        echo ""
        echo "🟠 AWS Amplify Deployment"
        echo "========================"
        echo ""
        echo "For AWS Amplify, follow these steps:"
        echo "1. Push your code to GitHub/GitLab/BitBucket"
        echo "2. Go to AWS Amplify Console"
        echo "3. Click 'New App' -> 'Host Web App'"
        echo "4. Connect your repository"
        echo "5. Amplify will auto-detect React and configure build settings"
        echo "6. Add environment variables"
        echo "7. Deploy!"
        echo ""
        echo "Would you like to push to GitHub now? (y/n)"
        read -p "> " push_github
        
        if [ "$push_github" = "y" ]; then
            echo "Enter your GitHub repository URL:"
            read -p "> " repo_url
            git remote add origin "$repo_url"
            git push -u origin main
            echo "✅ Pushed to GitHub! Now connect it in AWS Amplify Console."
        fi
        ;;
        
    4)
        echo ""
        echo "🔧 Manual Setup Guide"
        echo "===================="
        echo ""
        echo "For manual deployment, follow these steps:"
        echo ""
        echo "1. Build the application:"
        echo "   npm run build"
        echo ""
        echo "2. The build output will be in the 'dist' folder"
        echo ""
        echo "3. Upload the contents of 'dist' folder to your web server"
        echo ""
        echo "4. Configure your web server (Nginx/Apache) to:"
        echo "   - Serve index.html for all routes (SPA routing)"
        echo "   - Enable gzip compression"
        echo "   - Set proper cache headers"
        echo ""
        echo "5. Set environment variables on your server"
        echo ""
        echo "Example Nginx configuration:"
        echo "================================"
        cat << 'EOF'

server {
    listen 80;
    server_name your-domain.com;
    root /var/www/shortform/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

EOF
        echo ""
        echo "Would you like to build now? (y/n)"
        read -p "> " build_now
        
        if [ "$build_now" = "y" ]; then
            echo "Building application..."
            npm run build
            echo "✅ Build complete! Output is in 'dist' folder"
        fi
        ;;
        
    *)
        echo "❌ Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "================================================"
echo "🎉 Deployment process complete!"
echo ""
echo "📚 Next steps:"
echo "  1. Test your deployed application"
echo "  2. Set up analytics (Google Analytics, Plausible, etc.)"
echo "  3. Configure error tracking (Sentry)"
echo "  4. Set up monitoring and alerts"
echo "  5. Share with users!"
echo ""
echo "📖 See deployment-guide.md for detailed instructions"
echo "================================================"
