const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

router.get('/transactions', auth, async (req, res) => {
  const userId = req.userId;
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  res.json({ transactions: transactions || [] });
});

module.exports = router; 