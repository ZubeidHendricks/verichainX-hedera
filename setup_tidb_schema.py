#!/usr/bin/env python3
"""
Quick TiDB schema setup for VeriChainX
"""
import pymysql
import os
from dotenv import load_dotenv

load_dotenv()

def setup_tidb():
    """Set up TiDB database with VeriChainX schema"""
    
    # Connection details from the environment (never hardcode credentials).
    user = os.getenv('TIDB_USER')
    password = os.getenv('TIDB_PASSWORD')
    if not user or not password:
        raise RuntimeError(
            "TiDB credentials not configured. Set TIDB_USER and TIDB_PASSWORD "
            "(and optionally TIDB_HOST/TIDB_PORT) in the environment."
        )
    connection = pymysql.connect(
        host=os.getenv('TIDB_HOST', 'gateway01.us-west-2.prod.aws.tidbcloud.com'),
        port=int(os.getenv('TIDB_PORT', '4000')),
        user=user,
        password=password,
        database='test',  # Start with test database
        ssl={'verify_mode': 'none'},  # Required for TiDB Cloud Serverless
        charset='utf8mb4'
    )
    
    cursor = connection.cursor()
    
    print("✅ Connected to TiDB Cloud!")
    
    # Create verichainx database if it doesn't exist
    cursor.execute("CREATE DATABASE IF NOT EXISTS verichainx")
    cursor.execute("USE verichainx")
    print("📊 Using database: verichainx")
    
    # Create products table optimized for TiDB
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            price DECIMAL(12,2),
            seller_name VARCHAR(255),
            authenticity_score DECIMAL(3,2) DEFAULT 0.0,
            is_counterfeit BOOLEAN DEFAULT FALSE,
            confidence_score DECIMAL(3,2) DEFAULT 0.0,
            brand VARCHAR(100),
            category VARCHAR(100),
            embedding VECTOR(1536) COMMENT 'OpenAI embedding',
            hedera_nft_id VARCHAR(100),
            ai_analysis TEXT,
            evidence JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            INDEX idx_authenticity (authenticity_score),
            INDEX idx_price (price),
            INDEX idx_brand (brand),
            INDEX idx_counterfeit (is_counterfeit)
        ) COMMENT 'VeriChainX products optimized for TiDB HTAP'
    """)
    
    # Create analysis results table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS analysis_results (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            product_id BIGINT,
            analysis_type VARCHAR(50) DEFAULT 'ai_detection',
            confidence_score DECIMAL(3,2),
            ai_model VARCHAR(50),
            analysis_text TEXT,
            evidence JSON,
            processing_time_ms INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            
            INDEX idx_product (product_id),
            INDEX idx_confidence (confidence_score)
        )
    """)
    
    # Insert demo data
    cursor.execute("""
        INSERT IGNORE INTO products 
        (id, name, description, price, seller_name, authenticity_score, is_counterfeit, brand, category, ai_analysis, evidence) 
        VALUES 
        (1, 'iPhone 15 Pro Max', 'Latest Apple iPhone with titanium design', 1199.00, 'Apple Store', 0.98, FALSE, 'Apple', 'Electronics', 'Authentic Apple product from verified seller', '["verified_seller", "market_price"]'),
        (2, 'iPhone 15 Pro Max', 'Brand new iPhone, cheap price!', 299.00, 'CheapPhones123', 0.12, TRUE, 'Apple', 'Electronics', 'Suspicious: Price too low for authentic product', '["suspicious_price", "unverified_seller"]'),
        (3, 'Nike Air Jordan 1', 'Classic basketball sneakers', 170.00, 'Nike Official', 0.94, FALSE, 'Nike', 'Footwear', 'Authentic Nike product', '["official_seller", "appropriate_price"]'),
        (4, 'Rolex Submariner', 'Luxury diving watch - best replica', 500.00, 'WatchDeals99', 0.08, TRUE, 'Rolex', 'Watches', 'Counterfeit: Advertised as replica', '["replica_keyword", "suspicious_price"]')
    """)
    
    connection.commit()
    
    # Test the setup
    cursor.execute("SELECT COUNT(*) FROM products")
    count = cursor.fetchone()[0]
    print(f"📈 Products in database: {count}")
    
    cursor.execute("SELECT COUNT(*) FROM products WHERE is_counterfeit = TRUE")
    fakes = cursor.fetchone()[0]
    print(f"🚨 Counterfeit products: {fakes}")
    
    cursor.close()
    connection.close()
    
    print("🎉 TiDB setup complete!")
    print("✅ Database 'verichainx' created")
    print("✅ Tables created with demo data")
    print("✅ Ready for VeriChainX hackathon demo!")

if __name__ == "__main__":
    setup_tidb()