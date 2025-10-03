#!/usr/bin/env python3

import sys
sys.path.append('server')

from services.document_pipeline import postprocess_forms_in_text

test_text = """Transportation: 2,000
Per Diem: 1,250
Accomodation: 6,000
Travel purpose: Transportation:
Destination: Accommodation:
Travel period: Representation (optional):
Other importante notes: Others (please specify):
REQUESTED BY:             Norberto Bruzon Jr. FOR FINANCE DEPARTMENT
CHECK NO. ___________________________
CHECKED BY:              Keith Suarez
VOUCHER NO. ________________________
APPROVED BY: Keith Suarez PREPARED BY: ________________________
DATE: ______________________________
F001-A
BUDGET REQUEST FORM
Keith Suarez
Admin
Norberto Bruzon Jr.
September 01, 2025DATE OF REQUEST
NAME OF REQUESTOR
DEPARTMENT
SUPERVISOR
CONTROL NUMBER
DETAILS AND PARTICULARS:
Budget breakdown:
BUDGET REQUEST FOR Budget for Bayugan Budget
AMOUNT NEEDED PHP 9,250.00
PAYMENT METHOD RCBC
NAME OF PAYEE Norberto Jr J. Bruzon
PAYMENT DETAILS 0000 0090 5538 6450
Manager/CEO Name and Signature
Travel details:
FOR OFFICIAL TRAVELS, PLEASE FILL OUT BELOW:
Requestor Name and Signature
Supervisor Name and Signature"""

result = postprocess_forms_in_text(test_text)
print("Result:")
print(result)
print("\n" + "="*50 + "\n")

# Test with fewer than 3 forms
test_text2 = """Key1: Value1
Key2: Value2
Other text"""

result2 = postprocess_forms_in_text(test_text2)
print("Result2 (should not convert):")
print(result2)
