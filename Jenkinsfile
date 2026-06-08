@Library('jenkins-shared') _

pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }

    parameters {
        choice(name: 'ACTION', choices: ['', 'CI', 'BUILD'], description: 'Empty value enables automatic PR/main branch behavior.')
        string(name: 'RELEASE_VERSION', defaultValue: '', description: 'Optional release version for image tagging. Empty uses BUILD_NUMBER.')
        booleanParam(name: 'SKIP_TESTS', defaultValue: false, description: 'Skip package test and coverage scripts.')
        booleanParam(name: 'RUN_LLM_REVIEW', defaultValue: false, description: 'Run OpenAI-compatible local LLM review for PR/MR builds.')
    }

    environment {
        INTERNAL_REGISTRY = 'registry.debian.dc4.pl'
        IMAGE_NAMESPACE = 'swarmbotty'
        REGISTRY_CREDENTIALS_ID = 'swarm-jenkins'
    }

    stages {
        stage('CI') {
            when {
                anyOf {
                    changeRequest()
                    expression { !params.ACTION || params.ACTION == 'CI' || params.ACTION == 'BUILD' }
                }
            }
            steps {
                script {
                    if (!fileExists('package.json')) {
                        error('package.json not found; CI stage requires a TypeScript/Node application repository')
                    }

                    String manager = fileExists('pnpm-lock.yaml') ? 'pnpm'
                                   : fileExists('yarn.lock')      ? 'yarn'
                                   : 'npm'

                    sh manager == 'pnpm' ? 'corepack enable && pnpm install --frozen-lockfile'
                     : manager == 'yarn' ? 'corepack enable && yarn install --frozen-lockfile'
                     : 'npm ci'

                    int lintExists = sh(returnStatus: true,
                        script: "node -e \"const s=require('./package.json').scripts||{}; process.exit(s['lint'] ? 0 : 1)\"")
                    if (lintExists == 0) {
                        sh manager == 'pnpm' ? 'pnpm run lint' : manager == 'yarn' ? 'yarn lint' : 'npm run lint'
                    } else {
                        echo "package.json script 'lint' not found; skipping."
                    }

                    if (!params.SKIP_TESTS) {
                        int testExists = sh(returnStatus: true,
                            script: "node -e \"const s=require('./package.json').scripts||{}; process.exit(s['test'] ? 0 : 1)\"")
                        if (testExists == 0) {
                            sh manager == 'pnpm' ? 'pnpm run test' : manager == 'yarn' ? 'yarn test' : 'npm run test'
                        } else {
                            echo "package.json script 'test' not found; skipping."
                        }

                        int coverageExists = sh(returnStatus: true,
                            script: "node -e \"const s=require('./package.json').scripts||{}; process.exit(s['coverage'] ? 0 : 1)\"")
                        if (coverageExists == 0) {
                            sh manager == 'pnpm' ? 'pnpm run coverage' : manager == 'yarn' ? 'yarn coverage' : 'npm run coverage'
                        } else {
                            echo "package.json script 'coverage' not found; skipping."
                        }
                    }

                    if (env.CHANGE_ID) {
                        llmReview()
                    }
                }
                junit testResults: '**/junit*.xml', allowEmptyResults: true
                archiveArtifacts artifacts: 'coverage/**', allowEmptyArchive: true
            }
        }

        stage('Build') {
            when {
                not { changeRequest() }
                expression { (!params.ACTION && env.BRANCH_NAME == 'main') || params.ACTION == 'BUILD' }
            }
            steps {
                script {
                    if (!fileExists('Dockerfile')) {
                        error('Dockerfile not found; Build stage requires each application repository to provide one')
                    }

                    String jobPart = env.JOB_BASE_NAME.replaceAll(/[^a-zA-Z0-9_.-]+/, '-').replaceAll(/^-+|-+$/, '')
                    String version = (params.RELEASE_VERSION ?: '').trim() ?: env.BUILD_NUMBER
                    String imageTag = "${jobPart}-${version}"
                    String fullImage = "${env.INTERNAL_REGISTRY}/${env.IMAGE_NAMESPACE}/${env.JOB_BASE_NAME}:${imageTag}"

                    docker.withRegistry("https://${env.INTERNAL_REGISTRY}", env.REGISTRY_CREDENTIALS_ID) {
                        docker.build(fullImage).push()
                    }

                    env.IMAGE = fullImage
                    env.IMAGE_TAG = imageTag
                    writeFile file: 'image.txt', text: fullImage + '\n'
                    archiveArtifacts artifacts: 'image.txt'
                }
            }
        }

    }
}
