const express = require('express');
const { envoyerEmail } = require('../controllers/email.controller');

const router = express.Router();

router.post('/send', envoyerEmail);

module.exports = router;
