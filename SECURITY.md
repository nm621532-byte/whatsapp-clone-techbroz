# Security (Nov 1 2026 update)

Is app mein 3 cheezein pakki ki gayi hain:

1. **Data sirf apne user ko** — har naam ka apna PIN hai. Pehli baar jo naam + PIN rakhta hai, wahi naam uska ho jata hai. Bina sahi PIN ke koi "Rahul" naam daal ke Rahul ki private chats nahi padh sakta. PIN seedha save nahi hota, sirf uska hash (scrypt + salt) `data/accounts.json` mein (ye file GitHub pe nahi jaati). 5 galat PIN = 1 minute lock.
2. **Naya feature purana na tode** — `smoke_test.py` chalao (`npm install` ke baad `python3 smoke_test.py`, Playwright chahiye). Ye login, group chat, private chat, blue ticks aur security checks ek saath test karta hai.
3. **Kisi aur ka data nahi** — server message bhejne wale ka naam khud lagata hai (client se nahi leta), sirf apni history bhejta hai, "delivered" sirf receiver mark kar sakta hai, galat/khaali data se server crash nahi hota, aur naam/message mein HTML likhne se script nahi chalti.
