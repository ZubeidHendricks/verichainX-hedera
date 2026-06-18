/**
 * Admin panel — live Hedera network stats + recent on-chain transactions.
 */
import React, { useEffect, useState } from 'react';
import {
  Box, Card, CardContent, Stack, Typography, Chip, LinearProgress, Link, Table, TableHead, TableRow, TableCell, TableBody,
} from '@mui/material';
import LaunchIcon from '@mui/icons-material/Launch';
import { apiService, BlockchainTransaction, HederaNetwork, HederaStats } from '../../services/api';
import { CYAN } from '../../theme';

const NetStat = ({ label, value }: { label: string; value: string }) => (
  <Card sx={{ flex: 1, minWidth: 140 }}>
    <CardContent>
      <Typography variant="h5" sx={{ fontWeight: 800 }}>{value}</Typography>
      <Typography variant="body2">{label}</Typography>
    </CardContent>
  </Card>
);

export const HederaPanel: React.FC = () => {
  const [net, setNet] = useState<HederaNetwork | null>(null);
  const [stats, setStats] = useState<HederaStats | null>(null);
  const [txs, setTxs] = useState<BlockchainTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => Promise.all([
      apiService.getHederaNetwork().then(setNet).catch(() => {}),
      apiService.getHederaStats().then(setStats).catch(() => {}),
      apiService.getHederaTransactions().then(setTxs).catch(() => {}),
    ]).finally(() => setLoading(false));
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, []);

  return (
    <Stack spacing={3}>
      {loading && <LinearProgress />}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <NetStat label={`consensus nodes (${net?.network || 'testnet'})`} value={net?.consensusNodes ? String(net.consensusNodes) : '—'} />
        <NetStat label="total ℏ supply" value={net?.totalSupplyHbar ? net.totalSupplyHbar.toLocaleString() : '—'} />
        <NetStat label="today's verifications" value={stats ? stats.todayVerifications.toLocaleString() : '—'} />
        <NetStat label="network TPS" value={stats?.networkTps || '10,000+'} />
      </Stack>

      <Card>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 10px #22C55E' }} />
            <Typography variant="h6" sx={{ flex: 1 }}>Live Hedera transactions</Typography>
            <Chip size="small" variant="outlined" label={`real · ${net?.network || 'testnet'}`} sx={{ color: CYAN, borderColor: 'rgba(34,211,238,0.4)' }} />
          </Stack>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Transaction</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {txs.map((t) => (
                  <TableRow key={t.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{t.type}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" color={t.status === 'confirmed' ? 'success' : 'warning'} label={t.status} /></TableCell>
                    <TableCell>
                      {t.explorerUrl ? (
                        <Link href={t.explorerUrl} target="_blank" rel="noopener noreferrer" underline="hover"
                          sx={{ color: CYAN, display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.8rem' }}>
                          {t.txHash} <LaunchIcon sx={{ fontSize: 13 }} />
                        </Link>
                      ) : (
                        <Typography variant="caption" color="text.secondary">{t.txHash}</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && txs.length === 0 && (
                  <TableRow><TableCell colSpan={3} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>No transactions.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
};

export default HederaPanel;
