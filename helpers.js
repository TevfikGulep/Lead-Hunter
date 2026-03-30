// helpers.js

// --- HELPER: Decode HTML Entities ---
window.decodeHtmlEntities = (text) => {
    if (!text) return '';
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
};

// --- HELPER: Parse Traffic String to Number ---
window.parseTrafficToNumber = (str) => {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    
    const s = str.toString().toLowerCase().trim().replace(/,/g, '.');
    let multiplier = 1;
    
    if (s.includes('b')) multiplier = 1000000000;
    else if (s.includes('m')) multiplier = 1000000;
    else if (s.includes('k')) multiplier = 1000;
    
    const numPart = s.replace(/[^0-9.]/g, '');
    const num = parseFloat(numPart);
    
    return isNaN(num) ? 0 : num * multiplier;
};

// --- Lead Score Hesaplama ---
window.calculateLeadScore = (lead) => {
    let score = 0;

    // 1. Traffic Score (0-40)
    const trafficValue = lead.trafficStatus?.value || 0;
    if (trafficValue >= 500000) score += 40;
    else if (trafficValue >= 100000) score += 30;
    else if (trafficValue >= 50000) score += 20;
    else if (trafficValue >= 20000) score += 10;

    // 2. Email Quality Score (0-20)
    const email = (lead.email || '').toLowerCase();
    if (email) {
        const local = email.split('@')[0] || '';
        const genericPrefixes = ['info', 'contact', 'iletisim', 'destek', 'support', 'hello', 'office', 'genel'];
        const rolePrefixes = ['editor', 'reklam', 'advertising', 'marketing', 'satis', 'sales', 'yonetim', 'ceo', 'founder', 'director'];

        if (local.includes('.') || local.includes('_')) {
            score += 20; // Personal email (firstname.lastname@)
        } else if (rolePrefixes.some(p => local.includes(p))) {
            score += 15; // Role email
        } else if (genericPrefixes.some(p => local === p)) {
            score += 10; // Generic email
        } else {
            score += 12; // Unknown but has email
        }
    }

    // 3. Engagement Score (0-20)
    if (['INTERESTED', 'ASKED_MORE', 'IN_PROCESS', 'DEAL_ON'].includes(lead.statusKey)) {
        score += 20;
    } else if (lead.mailOpenedAt) {
        score += 10;
    } else if (lead.stage > 0) {
        score += 5;
    }
    if (lead.statusKey === 'MAIL_ERROR') score -= 20;

    // 4. Freshness Score (0-20)
    const lastContact = lead.lastContactDate || lead.addedDate;
    if (lastContact) {
        const daysSince = Math.floor((Date.now() - new Date(lastContact).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSince <= 7) score += 20;
        else if (daysSince <= 14) score += 15;
        else if (daysSince <= 30) score += 10;
        else if (daysSince <= 60) score += 5;
    }

    return Math.max(0, Math.min(100, score));
};

window.getScoreLabel = (score) => {
    if (score >= 70) return { label: 'Yüksek', color: 'text-green-600 font-bold' };
    if (score >= 40) return { label: 'Orta', color: 'text-yellow-600' };
    return { label: 'Düşük', color: 'text-gray-400' };
};

// --- Reply Kategorizasyon ---
window.categorizeReply = (snippet, from) => {
    if (!snippet) return { category: 'UNKNOWN', confidence: 0 };

    const text = snippet.toLowerCase().trim();

    // Positive signals
    const positiveKeywords = [
        'ilgileniyorum', 'interested', 'görüşelim', 'görüşmek', 'let\'s talk', 'schedule',
        'randevu', 'appointment', 'memnuniyetle', 'güzel', 'harika', 'great', 'sounds good',
        'uygun', 'available', 'kabul', 'accept', 'tamam', 'okay', 'evet', 'yes',
        'devam', 'continue', 'anlaşalım', 'deal', 'onaylıyorum', 'approve'
    ];

    // Info request signals
    const infoKeywords = [
        'nasıl', 'how', 'ne kadar', 'how much', 'fiyat', 'price', 'ücret', 'cost', 'fee',
        'detay', 'detail', 'bilgi', 'info', 'information', 'açıkla', 'explain',
        'daha fazla', 'more about', 'anlat', 'tell me', 'merak', 'curious',
        'şartlar', 'terms', 'conditions', 'süreç', 'process', 'ne yapıyorsunuz', 'what do you'
    ];

    // Negative signals
    const negativeKeywords = [
        'ilgilenmiyorum', 'not interested', 'hayır', 'no thanks', 'istemiyorum', 'don\'t want',
        'çıkar', 'remove', 'unsubscribe', 'spam', 'daha gönderme', 'stop sending',
        'rahatsız', 'bother', 'reddediyorum', 'reject', 'decline', 'gerek yok', 'no need'
    ];

    // Postpone signals
    const postponeKeywords = [
        'şu an değil', 'not now', 'sonra', 'later', 'gelecek', 'next month', 'ay sonu',
        'yoğun', 'busy', 'meşgul', 'occupied', 'zamanım yok', 'no time', 'ileride', 'future',
        'erteleme', 'postpone', 'delay', 'şimdi değil', 'not right now'
    ];

    let positiveScore = 0;
    let infoScore = 0;
    let negativeScore = 0;
    let postponeScore = 0;

    positiveKeywords.forEach(kw => { if (text.includes(kw)) positiveScore++; });
    infoKeywords.forEach(kw => { if (text.includes(kw)) infoScore++; });
    negativeKeywords.forEach(kw => { if (text.includes(kw)) negativeScore++; });
    postponeKeywords.forEach(kw => { if (text.includes(kw)) postponeScore++; });

    const maxScore = Math.max(positiveScore, infoScore, negativeScore, postponeScore);

    if (maxScore === 0) return { category: 'NEEDS_REVIEW', confidence: 0, suggestion: 'Manuel inceleme gerekli' };

    if (negativeScore === maxScore && negativeScore > 0) {
        return { category: 'DENIED', confidence: negativeScore / negativeKeywords.length, suggestion: 'Reddetti - takibi durdur' };
    }
    if (positiveScore === maxScore && positiveScore > 0) {
        return { category: 'INTERESTED', confidence: positiveScore / positiveKeywords.length, suggestion: 'İlgileniyor - hemen iletişime geç' };
    }
    if (infoScore === maxScore && infoScore > 0) {
        return { category: 'ASKED_MORE', confidence: infoScore / infoKeywords.length, suggestion: 'Bilgi istiyor - detay maili gönder' };
    }
    if (postponeScore === maxScore && postponeScore > 0) {
        return { category: 'FOLLOW_LATER', confidence: postponeScore / postponeKeywords.length, suggestion: 'Erteledi - 30 gün sonra tekrar dene' };
    }

    return { category: 'NEEDS_REVIEW', confidence: 0, suggestion: 'Manuel inceleme gerekli' };
};