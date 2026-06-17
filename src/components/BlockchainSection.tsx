/**
 * Blockchain Integration Section
 * 
 * Showcases Hedera Hashgraph integration and live blockchain activity
 */

import React, { useState, useEffect } from 'react';
import { Box, Typography, Container, Stack, Chip, Avatar, Link, Tooltip } from '@mui/material';
import { styled } from '@mui/material/styles';
import { GlassmorphicCard } from './GlassmorphicCard';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import VerifiedIcon from '@mui/icons-material/Verified';
import SpeedIcon from '@mui/icons-material/Speed';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import HubIcon from '@mui/icons-material/Hub';
import LaunchIcon from '@mui/icons-material/Launch';
import { apiService, BlockchainTransaction, HederaStats, HederaNetwork } from '../services/api';

const BlockchainContainer = styled(Box)(({ theme }) => ({
  background: 'linear-gradient(180deg, #000000 0%, #0a0a0a 100%)',
  padding: '120px 0',
  position: 'relative',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'radial-gradient(circle at 50% 50%, rgba(255, 215, 0, 0.05) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
}));

const TransactionCard = styled(GlassmorphicCard)<{ status?: string }>(({ status }) => ({
  padding: '16px',
  marginBottom: '12px',
  borderLeft: `4px solid ${
    status === 'verified' ? '#4CAF50' : 
    status === 'pending' ? '#FF9800' : '#FFD700'
  }`,
}));

const PulsingDot = styled(Box)<{ color?: string }>(({ color = '#4CAF50' }) => ({
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: color,
  animation: 'pulse 2s infinite',
  '@keyframes pulse': {
    '0%': {
      boxShadow: `0 0 0 0 ${color}40`,
    },
    '70%': {
      boxShadow: `0 0 0 10px ${color}00`,
    },
    '100%': {
      boxShadow: `0 0 0 0 ${color}00`,
    },
  },
}));

interface Transaction {
  id: string;
  type: 'verification' | 'nft_mint' | 'audit_log';
  product: string;
  timestamp: string;
  status: 'verified' | 'pending' | 'complete';
  txHash: string;
}

const mockTransactions: Transaction[] = [
  {
    id: '1',
    type: 'verification',
    product: 'iPhone 15 Pro Max',
    timestamp: '2 seconds ago',
    status: 'verified',
    txHash: '0x1a2b3c4d5e6f...',
  },
  {
    id: '2',
    type: 'nft_mint',
    product: 'Rolex Submariner',
    timestamp: '15 seconds ago',
    status: 'complete',
    txHash: '0x2b3c4d5e6f7a...',
  },
  {
    id: '3',
    type: 'audit_log',
    product: 'Louis Vuitton Bag',
    timestamp: '32 seconds ago',
    status: 'verified',
    txHash: '0x3c4d5e6f7a8b...',
  },
  {
    id: '4',
    type: 'verification',
    product: 'Nike Air Jordan 1',
    timestamp: '1 minute ago',
    status: 'pending',
    txHash: '0x4d5e6f7a8b9c...',
  },
];

const hederaStats = {
  tps: '10,000+',
  finality: '3-5 sec',
  energyEfficient: '99.99%',
  uptime: '100%',
};

export const BlockchainSection: React.FC = () => {
  const [transactions, setTransactions] = useState<BlockchainTransaction[]>([]);
  const [network, setNetwork] = useState<HederaNetwork | null>(null);
  const [liveStats, setLiveStats] = useState<HederaStats>({
    totalTransactions: 1247892,
    todayVerifications: 3421,
    nftsMinted: 15678,
    networkTps: '10,000+',
    finality: '3-5 sec',
    uptime: '100%',
  });

  useEffect(() => {
    // Initial data fetch
    const fetchData = async () => {
      try {
        const [txData, statsData, networkData] = await Promise.all([
          apiService.getHederaTransactions(),
          apiService.getHederaStats(),
          apiService.getHederaNetwork(),
        ]);
        setTransactions(txData);
        setLiveStats(statsData);
        setNetwork(networkData);
      } catch (error) {
        console.error('Failed to fetch blockchain data:', error);
        // Keep mock data as fallback
        setTransactions(mockTransactions);
      }
    };

    fetchData();

    // Set up periodic updates
    const interval = setInterval(async () => {
      try {
        const [txData, statsData, networkData] = await Promise.all([
          apiService.getHederaTransactions(),
          apiService.getHederaStats(),
          apiService.getHederaNetwork(),
        ]);
        setTransactions(txData);
        setLiveStats(statsData);
        setNetwork(networkData);
      } catch (error) {
        // Simulate new transactions as fallback
        const newTransaction: BlockchainTransaction = {
          id: Date.now().toString(),
          type: ['verification', 'nft_mint', 'audit_log'][Math.floor(Math.random() * 3)] as any,
          product: [
            'MacBook Pro M3',
            'Gucci Handbag',
            'Samsung Galaxy S24',
            'Adidas Yeezy',
            'Chanel Perfume',
          ][Math.floor(Math.random() * 5)],
          timestamp: new Date().toISOString(),
          status: ['verified', 'complete', 'pending'][Math.floor(Math.random() * 3)] as any,
          txHash: `0x${Math.random().toString(16).substr(2, 12)}...`,
        };

        setTransactions(prev => [newTransaction, ...prev.slice(0, 3)]);
        
        setLiveStats(prev => ({
          ...prev,
          totalTransactions: prev.totalTransactions + 1,
          todayVerifications: prev.todayVerifications + (newTransaction.type === 'verification' ? 1 : 0),
          nftsMinted: prev.nftsMinted + (newTransaction.type === 'nft_mint' ? 1 : 0),
        }));
      }
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'verification': return <VerifiedIcon />;
      case 'nft_mint': return <AccountBalanceIcon />;
      case 'audit_log': return <SpeedIcon />;
      default: return <VerifiedIcon />;
    }
  };

  const getTransactionLabel = (type: string) => {
    switch (type) {
      case 'verification': return 'Product Verified';
      case 'nft_mint': return 'Authenticity NFT';
      case 'audit_log': return 'Audit Log';
      // Real Hedera transaction types arrive as friendly labels already.
      default: return type || 'Transaction';
    }
  };

  return (
    <BlockchainContainer>
      <Container maxWidth="lg">
        <Stack spacing={8}>
          {/* Header */}
          <Stack spacing={3} alignItems="center" textAlign="center">
            <Typography
              variant="h2"
              sx={{
                background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontWeight: 700,
              }}
            >
              Hedera Blockchain Integration
            </Typography>
            <Typography
              variant="h6"
              sx={{
                color: 'rgba(255, 255, 255, 0.8)',
                maxWidth: '600px',
                lineHeight: 1.6,
              }}
            >
              Immutable verification powered by enterprise-grade blockchain infrastructure
            </Typography>
          </Stack>

          {/* Hedera Stats */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            <GlassmorphicCard sx={{ p: 3, flex: 1, textAlign: 'center' }}>
              <Stack spacing={2} alignItems="center">
                <SpeedIcon sx={{ fontSize: 48, color: '#FFD700' }} />
                <Typography variant="h4" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                  {liveStats.networkTps}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                  Transactions per second
                </Typography>
              </Stack>
            </GlassmorphicCard>

            <GlassmorphicCard sx={{ p: 3, flex: 1, textAlign: 'center' }}>
              <Stack spacing={2} alignItems="center">
                <VerifiedIcon sx={{ fontSize: 48, color: '#4CAF50' }} />
                <Typography variant="h4" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                  {liveStats.finality}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                  Transaction finality
                </Typography>
              </Stack>
            </GlassmorphicCard>

            <GlassmorphicCard sx={{ p: 3, flex: 1, textAlign: 'center' }}>
              <Stack spacing={2} alignItems="center">
                <FlashOnIcon sx={{ fontSize: 48, color: '#4CAF50' }} />
                <Typography variant="h4" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                  99.99%
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                  Energy efficient
                </Typography>
              </Stack>
            </GlassmorphicCard>

            <GlassmorphicCard sx={{ p: 3, flex: 1, textAlign: 'center' }}>
              <Stack spacing={2} alignItems="center">
                <AccountBalanceIcon sx={{ fontSize: 48, color: '#2196F3' }} />
                <Typography variant="h4" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                  {liveStats.uptime}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                  Network uptime
                </Typography>
              </Stack>
            </GlassmorphicCard>
          </Stack>

          {/* Live Activity */}
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={4}>
            {/* Live Transactions */}
            <GlassmorphicCard sx={{ p: 4, flex: 2 }}>
              <Stack spacing={3}>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <PulsingDot color="#4CAF50" />
                  <Typography variant="h6" sx={{ color: '#FFD700', fontWeight: 600 }}>
                    Live Blockchain Activity
                  </Typography>
                </Stack>
                
                <Stack spacing={2}>
                  {transactions.map((tx) => (
                    <TransactionCard key={tx.id} status={tx.status}>
                      <Stack direction="row" alignItems="center" spacing={2}>
                        <Avatar
                          sx={{
                            width: 32,
                            height: 32,
                            backgroundColor: tx.status === 'verified' ? '#4CAF50' : 
                                           tx.status === 'pending' ? '#FF9800' : '#FFD700',
                            fontSize: '1rem',
                          }}
                        >
                          {getTransactionIcon(tx.type)}
                        </Avatar>
                        
                        <Stack flex={1} sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2" sx={{ color: '#FFFFFF', fontWeight: 600 }}>
                            {tx.product}
                          </Typography>
                          {tx.explorerUrl ? (
                            <Link
                              href={tx.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              underline="hover"
                              sx={{
                                color: '#FFD700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 0.5,
                                fontSize: '0.75rem',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {tx.txHash}
                              <LaunchIcon sx={{ fontSize: 12 }} />
                            </Link>
                          ) : (
                            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                              {tx.txHash}
                            </Typography>
                          )}
                        </Stack>

                        <Chip
                          label={getTransactionLabel(tx.type)}
                          size="small"
                          sx={{
                            backgroundColor: 'rgba(255, 215, 0, 0.2)',
                            color: '#FFD700',
                            fontWeight: 600,
                          }}
                        />
                      </Stack>
                    </TransactionCard>
                  ))}
                </Stack>
              </Stack>
            </GlassmorphicCard>

            {/* Network Stats */}
            <GlassmorphicCard sx={{ p: 4, flex: 1 }}>
              <Stack spacing={4}>
                <Typography variant="h6" sx={{ color: '#FFD700', fontWeight: 600 }}>
                  Network Statistics
                </Typography>
                
                <Stack spacing={3}>
                  <Box>
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 1 }}>
                      Total Transactions
                    </Typography>
                    <Typography variant="h4" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                      {liveStats.totalTransactions.toLocaleString()}
                    </Typography>
                  </Box>
                  
                  <Box>
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 1 }}>
                      Today's Verifications
                    </Typography>
                    <Typography variant="h4" sx={{ color: '#4CAF50', fontWeight: 700 }}>
                      {liveStats.todayVerifications.toLocaleString()}
                    </Typography>
                  </Box>
                  
                  <Box>
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 1 }}>
                      NFTs Minted
                    </Typography>
                    <Typography variant="h4" sx={{ color: '#FFD700', fontWeight: 700 }}>
                      {liveStats.nftsMinted.toLocaleString()}
                    </Typography>
                  </Box>

                  {network && network.consensusNodes > 0 && (
                    <Box sx={{ pt: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                        <PulsingDot color="#2196F3" />
                        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                          Live {network.network} network
                        </Typography>
                        <Tooltip title="Real data from the Hedera Mirror Node">
                          <HubIcon sx={{ fontSize: 16, color: '#2196F3' }} />
                        </Tooltip>
                      </Stack>
                      <Typography variant="h5" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                        {network.consensusNodes} consensus nodes
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                        {network.totalSupplyHbar.toLocaleString()} ℏ total supply
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </Stack>
            </GlassmorphicCard>
          </Stack>
        </Stack>
      </Container>
    </BlockchainContainer>
  );
};