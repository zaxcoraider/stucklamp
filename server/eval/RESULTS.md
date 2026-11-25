# Stucklamp eval (2026-11-25)

Dataset: 38 synthetic beginner help requests in 3 classes (eval/classes.json). Runs: 3.

| Measure | Result |
|---|---|
| Grouping precision (grouped pairs that truly share a cause) | **1.00** |
| Grouping recall (true same-cause pairs that were grouped) | **0.91** |
| Shortened text fits the glasses (≤ 42 chars) | **38/38** (longest 40) |
| Requests that got a hint | **38/38** |
| Average time to shorten + hint one request | 6236 ms |

## Per run
- run 1 · Python + Flask lab: 6 groups, 8/8 grouped pairs correct, 18073 ms
- run 1 · Web basics (HTML/CSS/JS): 4 groups, 6/6 grouped pairs correct, 10636 ms
- run 1 · Git day: 3 groups, 5/5 grouped pairs correct, 4606 ms
- run 2 · Python + Flask lab: 6 groups, 8/8 grouped pairs correct, 15371 ms
- run 2 · Web basics (HTML/CSS/JS): 4 groups, 6/6 grouped pairs correct, 21966 ms
- run 2 · Git day: 3 groups, 5/5 grouped pairs correct, 4731 ms
- run 3 · Python + Flask lab: 6 groups, 11/11 grouped pairs correct, 45488 ms
- run 3 · Web basics (HTML/CSS/JS): 4 groups, 6/6 grouped pairs correct, 12286 ms
- run 3 · Git day: 3 groups, 5/5 grouped pairs correct, 6861 ms

## Wrongly grouped pairs
- none
