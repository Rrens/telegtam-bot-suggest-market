#!/bin/bash

# --- KONFIGURASI ---
TOKEN="7048693889:AAHOk6XHLsrFj5vwShHH7Le1CugmjF7t2V0"
CHAT_IDS=("653776943") 
THRESHOLD=80
HOSTNAME=$(hostname)

# 1. AMBIL DATA (Gunakan awk agar presisi tanpa butuh bc)
DISK_USAGE=$(df / --output=pcent | tail -1 | tr -dc '0-9')

RAM_USAGE=$(free | grep Mem | awk '{printf "%.0f", ($3/$2) * 100}')

CPU_CORES=$(nproc)
CPU_USAGE=$(cat /proc/loadavg | awk -v cores="$CPU_CORES" '{printf "%.0f", ($1/cores) * 100}')

# --- DEBUG INFO ---
echo "--- DEBUG INFO ---"
echo "Hostname: $HOSTNAME | Disk: $DISK_USAGE% | RAM: $RAM_USAGE% | CPU: $CPU_USAGE%"
echo "------------------"

# --- LOGIC ALERT ---
if [ "$DISK_USAGE" -gt "$THRESHOLD" ] || [ "$RAM_USAGE" -gt "$THRESHOLD" ] || [ "$CPU_USAGE" -gt "$THRESHOLD" ]; then
    
    echo "Logic: Threshold terlampaui, mengirim Chart + Bar..."

    # Fungsi Progress Bar
    get_bar() {
        local p=$1; local f=$((p/10)); local b=""
        for i in {1..10}; do if [ $i -le $f ]; then b="${b}◼️"; else b="${b}◻️"; fi; done
        echo "$b"
    }

    # Get Top Processes depending on what spiked
    TOP_PROCESSES=""
    if [ "$CPU_USAGE" -gt "$THRESHOLD" ]; then
        TOP_PROCESSES="

📊 <b>Top 5 CPU Processes:</b>
<code>$(ps -eo pid,%cpu,%mem,comm --sort=-%cpu | head -n 6 | awk '{printf "%-8s %-5s %-5s %s\n", $1, $2, $3, $4}')</code>"
    elif [ "$RAM_USAGE" -gt "$THRESHOLD" ]; then
        TOP_PROCESSES="

📊 <b>Top 5 RAM Processes:</b>
<code>$(ps -eo pid,%cpu,%mem,comm --sort=-%mem | head -n 6 | awk '{printf "%-8s %-5s %-5s %s\n", $1, $2, $3, $4}')</code>"
    elif [ "$DISK_USAGE" -gt "$THRESHOLD" ]; then
        TOP_PROCESSES="

📊 <b>Top 5 CPU Processes (Disk Spike):</b>
<code>$(ps -eo pid,%cpu,%mem,comm --sort=-%cpu | head -n 6 | awk '{printf "%-8s %-5s %-5s %s\n", $1, $2, $3, $4}')</code>"
    fi

    # 1. FORMAT CAPTION (BAR)
    CAPTION="⚠️ <b>SERVER LIMIT ALERT</b>
🌐 Host: <code>${HOSTNAME}</code>
────────────────────
⚡ <b>CPU:</b> ${CPU_USAGE}%
$(get_bar $CPU_USAGE)

🧠 <b>RAM:</b> ${RAM_USAGE}%
$(get_bar $RAM_USAGE)

💾 <b>Disk:</b> ${DISK_USAGE}%
$(get_bar $DISK_USAGE)
────────────────────
⏰ $(date '+%d %b %Y %H:%M:%S')${TOP_PROCESSES}"

    # 2. GENERATE CHART IMAGE URL
    CHART_URL="https://quickchart.io/chart?c={type:'horizontalBar',data:{labels:['CPU','RAM','DISK'],datasets:[{label:'Usage',data:[$CPU_USAGE,$RAM_USAGE,$DISK_USAGE],backgroundColor:['%23ff4b2b','%23ff416c','%2334e89e']}]},options:{scales:{xAxes:[{ticks:{min:0,max:100}}]}}}"

    # 3. KIRIM KE TELEGRAM (sendPhoto)
    for ID in "${CHAT_IDS[@]}"
    do
        echo "Mengirim ke $ID..."
        curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendPhoto" \
            --data-urlencode "chat_id=${ID}" \
            --data-urlencode "photo=${CHART_URL}" \
            --data-urlencode "caption=${CAPTION}" \
            --data-urlencode "parse_mode=HTML" > /dev/null
    done
    echo "Selesai!"
else
    echo "Logic: Aman, di bawah threshold."
fi
