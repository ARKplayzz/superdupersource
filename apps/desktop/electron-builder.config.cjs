// electron-builder config for the Windows installer.
//
// Signing switches on by itself once Azure Trusted Signing is set up: put these in the
// environment (GitHub Actions secrets for releases) and the installer and app are signed.
//   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET   service principal that may sign
//   AZURE_SIGNING_ENDPOINT     e.g. https://wus2.codesigning.azure.net/
//   AZURE_SIGNING_ACCOUNT      Trusted Signing account name
//   AZURE_CERT_PROFILE         certificate profile name
//   AZURE_PUBLISHER_NAME       must match the certificate's subject CN
// Without them the build is unsigned and Windows SmartScreen warns on install.

const signing = ['AZURE_CLIENT_ID', 'AZURE_SIGNING_ENDPOINT', 'AZURE_SIGNING_ACCOUNT', 'AZURE_CERT_PROFILE', 'AZURE_PUBLISHER_NAME'].every((k) => process.env[k])

module.exports = {
  appId: 'nz.kennedys.superdupersource',
  productName: 'SuperDuperSource',
  copyright: 'Copyright 2026 Andrew (kennedys.nz). MIT licence.',
  directories: { output: 'release', buildResources: 'resources' },
  files: ['out/**', 'resources/**', 'package.json'],
  asar: true,
  // atem-connection and ws have no native parts; nothing to rebuild for Electron.
  npmRebuild: false,
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/icon.ico',
    artifactName: 'SuperDuperSource-Setup-${version}.${ext}',
    ...(signing
      ? {
          azureSignOptions: {
            publisherName: process.env.AZURE_PUBLISHER_NAME,
            endpoint: process.env.AZURE_SIGNING_ENDPOINT,
            codeSigningAccountName: process.env.AZURE_SIGNING_ACCOUNT,
            certificateProfileName: process.env.AZURE_CERT_PROFILE,
          },
        }
      : {}),
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: 'SuperDuperSource',
    runAfterFinish: true,
    license: '../../LICENSE',
  },
  // Releases live on GitHub; electron-updater reads latest.yml from the newest release.
  publish: { provider: 'github', owner: 'ARKplayzz', repo: 'superdupersource', releaseType: 'release' },
}
