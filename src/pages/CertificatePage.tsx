/**
 * VeriChainX printable certificate — /certificate/:id
 *
 * A formal, print-optimized document rendered as white "paper" on the dark
 * app background. Verdict decides the document type:
 *   authentic     → Certificate of Authenticity
 *   counterfeit   → Counterfeit Verification Report (for refund/takedown claims)
 *   inconclusive  → Product Analysis Report
 * "Print or save as PDF" uses the browser's print dialog — no extra deps.
 */
import React, { useEffect, useState } from 'react';
import { Box, Container, Stack, Typography, Button, Skeleton, Alert } from '@mui/material';
import { useParams, Link as RouterLink } from 'react-router-dom';
import PrintIcon from '@mui/icons-material/Print';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { QRCodeSVG } from 'qrcode.react';
import { apiService, ProductDetail } from '../services/api';

const GREEN = '#15803D';
const AMBER = '#B45309';
const RED = '#B91C1C';
const INK = '#111827';
const MUTED = '#4B5563';

type Verdict = 'authentic' | 'inconclusive' | 'counterfeit';
const verdictOf = (p: ProductDetail): Verdict =>
  p.is_counterfeit ? 'counterfeit' : p.authenticity_score >= 0.8 ? 'authentic' : 'inconclusive';

const DOC: Record<Verdict, { title: string; color: string; statement: (name: string, score: number) => string }> = {
  authentic: {
    title: 'Certificate of Authenticity',
    color: GREEN,
    statement: (name, score) =>
      `VeriChainX AI analysis examined this product and found no counterfeit signals. "${name}" received an authenticity score of ${score}/100 and is assessed as authentic.`,
  },
  counterfeit: {
    title: 'Counterfeit Verification Report',
    color: RED,
    statement: (name, score) =>
      `VeriChainX AI analysis flagged strong counterfeit signals for "${name}" (authenticity score ${score}/100). This report documents the negative verification and may be presented to the seller or marketplace in support of a refund or takedown request.`,
  },
  inconclusive: {
    title: 'Product Analysis Report',
    color: AMBER,
    statement: (name, score) =>
      `VeriChainX AI analysis could not fully confirm the authenticity of "${name}" (score ${score}/100). The evidence below documents the signals considered. Further physical inspection is recommended.`,
  },
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Box>
    <Typography sx={{ fontSize: 10, letterSpacing: '0.12em', color: MUTED, textTransform: 'uppercase', fontWeight: 700 }}>{label}</Typography>
    <Typography sx={{ color: INK, fontWeight: 600, fontSize: 14, wordBreak: 'break-word' }}>{value}</Typography>
  </Box>
);

export const CertificatePage: React.FC = () => {
  const { id } = useParams();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiService.getProduct(id).then(setProduct).catch(() => setError('No record found for this ID.'));
  }, [id]);

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: 8 }}>
        <Alert severity="warning" action={<Button component={RouterLink} to="/">Home</Button>}>{error}</Alert>
      </Container>
    );
  }
  if (!product) {
    return (
      <Container maxWidth="md" sx={{ py: 6 }}>
        <Skeleton variant="rounded" height={560} />
      </Container>
    );
  }

  const verdict = verdictOf(product);
  const doc = DOC[verdict];
  const score = Math.round(product.authenticity_score * 100);
  const verifyUrl = `${window.location.origin}/verify/${product.id}`;
  const issued = product.created_at ? new Date(product.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  return (
    <Box sx={{ minHeight: '100vh', py: { xs: 3, md: 6 }, '@media print': { py: 0, background: '#fff' } }}>
      <Container maxWidth="md">
        <Stack direction="row" spacing={1.5} sx={{ mb: 3, '@media print': { display: 'none' } }}>
          <Button component={RouterLink} to={`/verify/${product.id}`} startIcon={<ArrowBackIcon />} variant="outlined" size="small">
            Back to record
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => window.print()} startIcon={<PrintIcon />} variant="contained" size="small">
            Print or save as PDF
          </Button>
        </Stack>

        {/* The document */}
        <Box sx={{
          background: '#FDFDFB', color: INK, borderRadius: 2, p: { xs: 3, sm: 6 },
          border: `1px solid ${doc.color}`, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          '@media print': { boxShadow: 'none', borderRadius: 0, border: 'none', p: 4 },
        }}>
          {/* Letterhead */}
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
            <Box sx={{ width: 34, height: 34, borderRadius: '9px', background: 'linear-gradient(135deg, #7C5CFF, #22D3EE)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>◆</Box>
            <Box>
              <Typography sx={{ fontWeight: 800, color: INK, lineHeight: 1.1 }}>VeriChainX</Typography>
              <Typography sx={{ fontSize: 11, color: MUTED }}>AI authenticity verification · anchored on Hedera</Typography>
            </Box>
            <Box sx={{ flex: 1 }} />
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: 11, color: MUTED }}>Record no.</Typography>
              <Typography sx={{ fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>#{product.id}</Typography>
            </Box>
          </Stack>

          <Box sx={{ borderTop: `3px solid ${doc.color}`, my: 3 }} />

          <Typography sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: 800, color: doc.color, letterSpacing: '-0.02em', mb: 1.5 }}>
            {doc.title}
          </Typography>
          <Typography sx={{ color: INK, fontSize: 15, lineHeight: 1.7, mb: 4, maxWidth: 640 }}>
            {doc.statement(product.name, score)}
          </Typography>

          {/* Details grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 2.5, mb: 4 }}>
            <Field label="Product" value={product.name} />
            <Field label="Brand" value={product.brand || '—'} />
            <Field label="Category" value={product.category || '—'} />
            <Field label="Listed price" value={product.price > 0 ? `$${product.price.toLocaleString()}` : '—'} />
            <Field label="Authenticity score" value={`${score} / 100`} />
            <Field label="Analysis date" value={issued} />
            <Field label="Seller" value={product.seller_name || '—'} />
            <Field label="AI model" value="VeriChainX multi-agent" />
            <Field label="Network" value={`Hedera ${product.network}`} />
          </Box>

          {product.evidence.length > 0 && (
            <Box sx={{ mb: 4 }}>
              <Typography sx={{ fontSize: 10, letterSpacing: '0.12em', color: MUTED, textTransform: 'uppercase', fontWeight: 700, mb: 1 }}>Evidence considered</Typography>
              <ul style={{ margin: 0, paddingLeft: 18, color: INK }}>
                {product.evidence.map((e, i) => (
                  <li key={i} style={{ fontSize: 13.5, lineHeight: 1.7 }}>{e}</li>
                ))}
              </ul>
            </Box>
          )}

          {/* On-chain proof */}
          {product.anchor?.topic_id && (
            <Box sx={{ mb: 4, p: 2, border: '1px solid #E5E7EB', borderRadius: 1.5, background: '#F9FAFB' }}>
              <Typography sx={{ fontSize: 10, letterSpacing: '0.12em', color: MUTED, textTransform: 'uppercase', fontWeight: 700, mb: 0.5 }}>On-chain proof — Hedera Consensus Service</Typography>
              <Typography sx={{ fontSize: 13, color: INK }}>
                Topic {product.anchor.topic_id}
                {product.anchor.sequence_number != null && ` · message #${product.anchor.sequence_number}`}
                {product.anchor.anchored_at && ` · ${new Date(product.anchor.anchored_at).toLocaleString()}`}
              </Typography>
              {product.anchor.explorer_url && (
                <Typography sx={{ fontSize: 12.5, color: MUTED, wordBreak: 'break-all' }}>{product.anchor.explorer_url}</Typography>
              )}
            </Box>
          )}

          {/* Footer: QR + verification note */}
          <Stack direction="row" spacing={2.5} alignItems="center" sx={{ borderTop: '1px solid #E5E7EB', pt: 3 }}>
            <QRCodeSVG value={verifyUrl} size={92} level="M" fgColor={INK} bgColor="transparent" />
            <Box>
              <Typography sx={{ fontSize: 13, color: INK, fontWeight: 600 }}>Verify this document</Typography>
              <Typography sx={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6 }}>
                Scan the code or visit {verifyUrl} — the live record must match this document.
                {product.anchor?.topic_id ? ' The verdict is anchored immutably on the Hedera Consensus Service.' : ''}
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};

export default CertificatePage;
