BASE=http://localhost:3000/api/v1

# ─── SETUP ───
# Login as Alice (user A)
A_ACCESS=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@barter.local","password":"password123"}' | jq -r .accessToken)

# Get category IDs
SMART=$(curl -s $BASE/categories | jq -r '.[] | select(.slug=="smartphones") | .id')
ELEC=$(curl -s $BASE/categories | jq -r '.[] | select(.slug=="audio") | .id')
SHOES=$(curl -s $BASE/categories | jq -r '.[] | select(.slug=="clothing") | .id')

# ─── TEST 1: Alice posts iPhone 17 (FREE tier, 1 product) ───
A_PRODUCT=$(curl -s -X POST $BASE/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $A_ACCESS" \
  -d "{
    \"title\":\"iPhone 17\",
    \"description\":\"Brand new sealed iPhone 17 256GB\",
    \"condition\":\"NEW\",
    \"estimatedValue\":1200,
    \"categoryId\":\"$SMART\",
    \"wants\":[
      {\"categoryId\":\"$ELEC\",\"keywords\":\"Sony\"},
      {\"categoryId\":\"$SHOES\",\"keywords\":\"Nike\"}
    ]
  }")
A_PID=$(echo "$A_PRODUCT" | jq -r .id)
echo "Alice's product: $A_PID"

# ─── TEST 2: Alice tries to post second product (should fail: FREE limit) ───
curl -s -X POST $BASE/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $A_ACCESS" \
  -d "{\"title\":\"iPad\",\"description\":\"Long enough desc\",\"condition\":\"GOOD\",\"estimatedValue\":500,\"categoryId\":\"$SMART\",\"wants\":[{\"categoryId\":\"$ELEC\"}]}" \
  | jq .
# → { "code": "FREE_TIER_POST_LIMIT", ... }

# ─── TEST 3: Create Bob (PRO tier) ───
docker exec -it barter-pg psql -U postgres -d barter -c "
  INSERT INTO \"User\" (id, email, name, \"passwordHash\", role, \"isActive\", tier, \"createdAt\", \"updatedAt\")
  VALUES ('bob', 'bob@barter.local', 'Bob', '', 'USER', true, 'PRO', NOW(), NOW())
  ON CONFLICT (email) DO UPDATE SET tier='PRO';
"

# Login as Bob (set a password via SQL — but simpler: use Bob's session via direct SQL)
# OR create Bob's password properly via seed:
# For simplicity, give Bob a password directly:
docker exec -it barter-pg psql -U postgres -d barter -c "
  UPDATE \"User\" SET \"passwordHash\" = (SELECT \"passwordHash\" FROM \"User\" WHERE email='test@barter.local') WHERE id='bob';
"

B_ACCESS=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@barter.local","password":"password123"}' | jq -r .accessToken)

# ─── TEST 4: Bob posts Samsung S24 Ultra (PRO, unlimited) ───
B_PRODUCT=$(curl -s -X POST $BASE/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $B_ACCESS" \
  -d "{
    \"title\":\"Samsung S24 Ultra\",
    \"description\":\"S24 Ultra 512GB excellent condition\",
    \"condition\":\"LIKE_NEW\",
    \"estimatedValue\":1100,
    \"categoryId\":\"$ELEC\",
    \"wants\":[{\"categoryId\":\"$SMART\",\"keywords\":\"iPhone\"}]
  }")
B_PID=$(echo "$B_PRODUCT" | jq -r .id)
echo "Bob's product: $B_PID"

# ─── TEST 5: Alice checks matches (should see Bob's product with score) ───
curl -s $BASE/matches -H "Authorization: Bearer $A_ACCESS" | jq .
# → { matches: [{ product: {...Samsung}, score: 95, reasons: [...] }], totalCount: 1, hiddenCount: 0, tier: "FREE" }

# ─── TEST 6: Bob checks matches (should see Alice's iPhone) ───
curl -s $BASE/matches -H "Authorization: Bearer $B_ACCESS" | jq '.matches[0].product.title'
# → "iPhone 17"

# ─── TEST 7: Alice sends offer to Bob ───
OFFER=$(curl -s -X POST $BASE/offers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $A_ACCESS" \
  -d "{
    \"offeredProductId\":\"$A_PID\",
    \"requestedProductId\":\"$B_PID\",
    \"message\":\"Interested in the Samsung?\"
  }")
OFFER_ID=$(echo "$OFFER" | jq -r .id)
echo "Offer: $OFFER_ID"
# Check server logs → 🔔 [PUSH] user=bob | New barter offer | Alice wants to trade for your "Samsung S24 Ultra"

# ─── TEST 8: Both products now PENDING ───
curl -s $BASE/products/$A_PID -H "Authorization: Bearer $A_ACCESS" | jq .status
# → "PENDING"
curl -s $BASE/products/$B_PID -H "Authorization: Bearer $B_ACCESS" | jq .status
# → "PENDING"

# ─── TEST 9: Bob opens his offers ───
curl -s "$BASE/offers?box=incoming" -H "Authorization: Bearer $B_ACCESS" | jq '.[0].sender.name'
# → "Test User"

# ─── TEST 10: Bob sends a message ───
curl -s -X POST $BASE/offers/$OFFER_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $B_ACCESS" \
  -d '{"content":"Yes! When can we meet?"}' | jq .
# Check server logs → 🔔 [PUSH] user=alice | New message from Bob

# ─── TEST 11: Alice replies ───
curl -s -X POST $BASE/offers/$OFFER_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $A_ACCESS" \
  -d '{"content":"Tomorrow at 3pm works"}' | jq .

# ─── TEST 12: Bob accepts ───
curl -s -X PATCH $BASE/offers/$OFFER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $B_ACCESS" \
  -d '{"action":"accept"}' | jq .
# → { ok: true, status: "ACCEPTED" }
# Check server logs → 🔔 [PUSH] user=alice | Offer accepted 🎉 | Bob accepted your barter offer

# ─── TEST 13: Verify ownership swapped ───
curl -s $BASE/products/$A_PID | jq .owner.name
# → "Bob"   ← iPhone now owned by Bob
curl -s $BASE/products/$B_PID | jq .owner.name
# → "Test User"  ← Samsung now owned by Alice

# ─── TEST 14: Alice marks swap complete ───
curl -s -X PATCH $BASE/offers/$OFFER_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $A_ACCESS" \
  -d '{"action":"complete"}' | jq .
# → { ok: true, status: "COMPLETED" }
# Check logs → 🔔 [PUSH] user=bob | Swap complete ✅

# ─── TEST 15: Both products SWAPPED ───
curl -s $BASE/products/$A_PID | jq .status
# → "SWAPPED"