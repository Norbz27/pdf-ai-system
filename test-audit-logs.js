// Test script for audit logging system
const { auditLogger } = require('./lib/audit-logger.ts')

async function testAuditLogging() {
  console.log('Testing audit logging system...')

  try {
    // Test successful login
    console.log('Testing user login...')
    const loginResult = await auditLogger.userLogin(
      'Test User',
      'test@example.com',
      '192.168.1.100',
      'Mozilla/5.0 Test Browser'
    )
    console.log('Login audit result:', loginResult)

    // Test failed login
    console.log('Testing failed login...')
    const failedLoginResult = await auditLogger.loginFailed(
      'Test User',
      'test@example.com',
      '192.168.1.100',
      'Mozilla/5.0 Test Browser'
    )
    console.log('Failed login audit result:', failedLoginResult)

    // Test document upload
    console.log('Testing document upload...')
    const uploadResult = await auditLogger.documentUpload(
      'Test User',
      'test@example.com',
      'test-document.pdf',
      '2.5 MB',
      10,
      '192.168.1.100'
    )
    console.log('Document upload audit result:', uploadResult)

    console.log('All audit logging tests completed successfully!')
  } catch (error) {
    console.error('Audit logging test failed:', error)
  }
}

// Run the test
testAuditLogging()
