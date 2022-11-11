# RC-Unified-CRM-Extension

node16+ for esbuild copy

# Contact

- Unknown incoming call / Unknown number log -> reminder for user to log
- 

## Pipedrive
### Call log

Require: 
    - 1. Call Info from RC API
      - Embeddable event
    - 2. user_id
      - jwt -> db
    - 3. person_id
      - Call Info -> phone number -> /v1/persons/search?term={phoneNumber}&fields=phone
    - 4. deal_id
      - person_id -> /v1/persons/{id}/deals -> filter by user_id


### Message Log Check

    - Client side check ONLY. (manage Embeddable auto log historical check)
      - Auto Log: can only be triggered by Embeddable's historical check
      - Manual Log: can always be triggered, but won't do log match to Embeddable
    - Server side validation, duplicated log won't be processed. (manage platform API call)
      - Log request will be sent as a pack of messages, logged message won't be logged again
