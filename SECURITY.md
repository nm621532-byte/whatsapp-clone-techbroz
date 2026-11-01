# Security (Nov 1 2026 update)

Live: https://whatsapp-clone-live.sites.tab.bot — isi code pe chalta hai.

1. **Data sirf apne user ko** — har naam ka apna PIN hai. Pehli baar jo naam + PIN rakhta hai, wahi naam uska ho jata hai ("Rahul" aur "rahul" ek hi naam maane jaate hain, nakli account nahi bana sakte). PIN seedha save nahi hota, sirf uska hash (scrypt + salt) `data/accounts.json` mein (ye file GitHub pe nahi jaati).
2. **Private chat sirf apni** — server sender ka naam khud lagata hai (client se nahi leta), sirf apni history bhejta hai, har user ka apna room (`u:<naam>`), login ke bina socket ko koi message / typing / online list nahi milti, "delivered"/"seen" sirf receiver mark kar sakta hai.
3. **Brute force / spam rok** — ek naam pe 5 galat PIN = 1 minute lock; ek IP se login aur naye accounts ki limit; 10 second mein 20 message se zyada nahi.
4. **Login yaad rakhna safely** — reload pe random session token (localStorage), server pe sirf token ka SHA-256 hash, 30 din expiry, Logout pe token delete.
5. **XSS nahi** — naam sirf letters/numbers/space . _ - ; message aur naam hamesha `textContent` se dikhte hain (HTML/script nahi chalti) + Content-Security-Policy header (sirf apni scripts), nosniff, frame deny.
6. **Test** — `test/e2e.py` (2 users, phone size browsers) + `test/attack.js` (raw socket tricks) — README mein tareeka.
