/**
 * Admin panel — submit a product for AI authenticity analysis.
 */
import React, { useState } from 'react';
import {
  Box, Card, CardContent, Stack, Typography, TextField, Button, Chip, LinearProgress, Alert, Divider,
} from '@mui/material';
import VerifiedIcon from '@mui/icons-material/Verified';
import GppMaybeIcon from '@mui/icons-material/GppMaybe';
import { apiService } from '../../services/api';

export const ProductAnalysis: React.FC = () => {
  const [form, setForm] = useState({ product_name: '', description: '', price: '', category: 'Electronics' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setError(null); setResult(null); setLoading(true);
    try {
      const res = await apiService.analyzeProduct({
        product_name: form.product_name || 'Sample Product',
        description: form.description || 'No description provided',
        price: parseFloat(form.price) || 0,
        category: form.category,
      });
      if (!res || typeof res !== 'object') throw new Error('Unexpected response');
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Analysis failed. Check that the API and TiDB credentials are configured.');
    } finally {
      setLoading(false);
    }
  };

  const score = result ? Math.round((result.authenticity_score ?? 0) * 100) : 0;
  const counterfeit = !!result?.is_counterfeit;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Analyze a product</Typography>
          <Stack spacing={2}>
            <TextField label="Product name" value={form.product_name} onChange={set('product_name')} fullWidth />
            <TextField label="Description" value={form.description} onChange={set('description')} fullWidth multiline minRows={3} />
            <Stack direction="row" spacing={2}>
              <TextField label="Price (USD)" value={form.price} onChange={set('price')} type="number" sx={{ flex: 1 }} />
              <TextField label="Category" value={form.category} onChange={set('category')} sx={{ flex: 1 }} />
            </Stack>
            <Button variant="contained" onClick={submit} disabled={loading}>
              {loading ? 'Analyzing…' : 'Run AI analysis'}
            </Button>
            {loading && <LinearProgress />}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Result</Typography>
          {error && <Alert severity="warning">{error}</Alert>}
          {!result && !error && <Typography variant="body2">Submit a product to see its authenticity verdict.</Typography>}
          {result && (
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                {counterfeit ? <GppMaybeIcon color="error" /> : <VerifiedIcon color="success" />}
                <Chip
                  label={counterfeit ? 'Likely counterfeit' : 'Authentic'}
                  color={counterfeit ? 'error' : 'success'}
                  variant="outlined"
                />
                <Typography variant="h4" sx={{ ml: 'auto', fontWeight: 800 }}>{score}%</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={score} color={counterfeit ? 'error' : 'success'} sx={{ height: 8, borderRadius: 4 }} />
              {result.ai_analysis && (<><Divider /><Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{result.ai_analysis}</Typography></>)}
              {Array.isArray(result.recommendations) && result.recommendations.length > 0 && (
                <Box>
                  <Typography variant="overline" color="primary">Recommendations</Typography>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: '#A1A1AA' }}>
                    {result.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </Box>
              )}
              <Typography variant="caption" color="text.secondary">
                Processed in {result.processing_time_ms ?? '—'} ms · product #{result.product_id ?? '—'}
                {result.hedera_nft_ready ? ' · NFT-ready' : ''}
              </Typography>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ProductAnalysis;
