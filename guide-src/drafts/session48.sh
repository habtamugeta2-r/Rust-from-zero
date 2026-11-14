#!/bin/bash
# Captures the real curl sessions of chapter 48 into drafts/48_session.txt, 48_log.txt, 48_b_session.txt, 48_test.txt
. /opt/rs/env.sh
D=/home/user/guide-src/drafts
W=/opt/rs/tmp/sess48; rm -rf $W; mkdir -p $W; cd $W
for s in shortener shortener_b; do (cd /opt/rs/scratch/$s && touch src/main.rs src/lib.rs build.rs && cargo build -q 2>&1 | grep -v "unused dep\|^warning" | tail -2); cp /opt/rs/target/debug/shortener $W/bin_$s; done
export API_KEY=my-very-secret-key-123 PORT=3000
OUT=$D/48_session.txt; : > $OUT
c() { printf '$ curl' >> $OUT; for a in "$@"; do case "$a" in *" "*|*"{"*) printf " '%s'" "$a" >> $OUT;; *) printf ' %s' "$a" >> $OUT;; esac; done; echo >> $OUT; curl -s "$@" | tr -d '\r' >> $OUT; echo >> $OUT; echo "@@@" >> $OUT; }
(./bin_shortener > run.log 2>&1 &); sleep 1.5
J='content-type: application/json'
c -X POST http://localhost:3000/links -H "$J" -d '{"url": "https://doc.rust-lang.org/book/", "code": "book"}'
c -i http://localhost:3000/book
c http://localhost:3000/links/book
c -X POST http://localhost:3000/links -H "$J" -d '{"url": "https://www.rust-lang.org"}'
c -X POST http://localhost:3000/links -H "$J" -d '{"url": "https://example.com", "code": "book"}'
c -X POST http://localhost:3000/links -H "$J" -d '{"url": "example.com"}'
c -X POST http://localhost:3000/links -H "$J" -d '{"url": '
c http://localhost:3000/links
c http://localhost:3000/links -H 'x-api-key: my-very-secret-key-123'
c -i -X DELETE http://localhost:3000/links/book -H 'x-api-key: my-very-secret-key-123'
c http://localhost:3000/book
c http://localhost:3000/a/b/c
c http://localhost:3000/health
pkill -INT -f "./bin_shortener"; sleep 1
sed 's/\x1b\[[0-9;]*m//g' run.log > $D/48_log.txt

# ---- exercise 2: the new program on the old database file
(./bin_shortener > run1.log 2>&1 &); sleep 1
curl -s -X POST http://localhost:3000/links -H "$J" -d '{"url": "https://doc.rust-lang.org/book/", "code": "book"}' > /dev/null
pkill -INT -f "./bin_shortener"; sleep 1
OUT=$D/48_b_session.txt; : > $OUT
(./bin_shortener_b > run2.log 2>&1 &); sleep 1.5
c http://localhost:3000/links/book
c -i http://localhost:3000/book
c http://localhost:3000/links/book
pkill -INT -f "./bin_shortener_b"; sleep 1
cd /opt/rs/scratch/shortener && rm -f links.db* && cargo test 2>&1 | grep -v "^ *Compiling\|^ *Blocking\|^warning\|^ *Locking\|unused dep" > $D/48_test.txt
rm -rf $W
echo captured
