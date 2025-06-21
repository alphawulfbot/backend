const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

router.get('/history', auth, async (req, res) => {
  const userId = req.userId;
  const { data: history } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  res.json({ history: history || [] });
});

module.exports = router; 