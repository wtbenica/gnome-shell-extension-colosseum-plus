#!/bin/bash
# Helper script to view and analyze Sportradar API call logs

LOG_FILE="$HOME/.cache/colosseum-extension/logs/sportradar-api-calls.log"

if [ ! -f "$LOG_FILE" ]; then
    echo "No API log file found at: $LOG_FILE"
    echo "The log file will be created after the extension makes its first API call."
    exit 1
fi

echo "=== Sportradar API Call Log ==="
echo "Log file: $LOG_FILE"
echo ""

# Show total number of lines (each line is a log entry)
TOTAL_ENTRIES=$(wc -l < "$LOG_FILE")
echo "Total log entries: $TOTAL_ENTRIES"
echo ""

# Count actual API calls (exclude cache hits/misses)
API_CALLS=$(grep -c "API CALL:" "$LOG_FILE")
echo "Actual API calls made: $API_CALLS"
echo ""

# Count cache hits and misses
CACHE_HITS=$(grep -c "CACHE HIT:" "$LOG_FILE")
CACHE_MISSES=$(grep -c "CACHE MISS:" "$LOG_FILE")
echo "Cache hits: $CACHE_HITS"
echo "Cache misses: $CACHE_MISSES"

if [ $((CACHE_HITS + CACHE_MISSES)) -gt 0 ]; then
    HIT_RATE=$(awk "BEGIN {printf \"%.1f\", ($CACHE_HITS / ($CACHE_HITS + $CACHE_MISSES)) * 100}")
    echo "Cache hit rate: ${HIT_RATE}%"
fi
echo ""

# Show breakdown by endpoint
echo "=== API Calls by Endpoint ==="
grep "API CALL:" "$LOG_FILE" | sed 's/.*API CALL: //' | sort | uniq -c | sort -rn
echo ""

# Show recent entries (last 20)
echo "=== Recent Log Entries (last 20) ==="
tail -n 20 "$LOG_FILE"
echo ""

# Options for user
echo "=== Options ==="
echo "View full log:     cat $LOG_FILE"
echo "Clear log:         rm $LOG_FILE"
echo "Watch live:        tail -f $LOG_FILE"
echo "Count by date:     grep 'API CALL:' $LOG_FILE | cut -d'T' -f1 | sort | uniq -c"
