/**
 * Admin panel — recent detection results from TiDB.
 */
import React, { useEffect, useState } from 'react';
import {
  Card, CardContent, Stack, Typography, Table, TableHead, TableRow, TableCell, TableBody, Chip, LinearProgress, Button, Box,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import LaunchIcon from '@mui/icons-material/Launch';
import { Link as RouterLink } from 'react-router-dom';
import { apiService, DetectionActivity } from '../../services/api';

export const ResultsTable: React.FC = () => {
  const [rows, setRows] = useState<DetectionActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiService.getRecentActivity().then((r) => setRows(r)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const color = (s: string) => (s === 'verified' ? 'success' : s === 'flagged' ? 'error' : 'warning');

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>Detection results</Typography>
          <Button size="small" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>
        </Stack>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Product</TableCell>
                <TableCell>Confidence</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Agent</TableCell>
                <TableCell>Time</TableCell>
                <TableCell align="right">Record</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{r.productName}</TableCell>
                  <TableCell>{r.confidence}%</TableCell>
                  <TableCell><Chip size="small" variant="outlined" color={color(r.status) as any} label={r.status} /></TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{r.agentId}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{new Date(r.timestamp).toLocaleString()}</TableCell>
                  <TableCell align="right">
                    <Button component={RouterLink} to={`/verify/${r.id}`} size="small" endIcon={<LaunchIcon />}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>No results yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ResultsTable;
