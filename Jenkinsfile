pipeline {
    agent { label 'docker' }

    options {
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }

    environment {
        IMAGE = 'ghcr.io/swarmbot-it/swarmbot'
        REGISTRY_CREDENTIALS_ID = 'nh-jenkins-github-app-swarmbot'
    }

    stages {
        stage('Test') {
            when { changeRequest() }
            steps {
                script {
                    docker.image('node:26-alpine')
                          .inside("-e HOME=${env.WORKSPACE} -e npm_config_cache=${env.WORKSPACE}/.npm") {
                        sh 'npm ci'
                        sh 'npm run lint --if-present'
                        sh 'npm run test --if-present'
                    }
                }
            }
        }

        stage('Build image') {
            steps {
                script {
                    String shortSha = (env.GIT_COMMIT ?: 'dev').take(7)
                    env.IMAGE_TAG = "${env.BUILD_NUMBER}-${shortSha}"
                    docker.build(
                        "${env.IMAGE}:${env.IMAGE_TAG}",
                        "--label org.opencontainers.image.source=https://github.com/swarmbot-it/swarmbot" +
                        " --label org.opencontainers.image.revision=${env.GIT_COMMIT ?: ''} ."
                    )
                }
            }
        }

        // Publishing happens only from main - PR builds stop at test + image build.
        stage('Push to GHCR') {
            when { branch 'main' }
            steps {
                script {
                    docker.withRegistry('https://ghcr.io', env.REGISTRY_CREDENTIALS_ID) {
                        def image = docker.image("${env.IMAGE}:${env.IMAGE_TAG}")
                        image.push()
                        image.push('latest')
                    }
                    writeFile file: 'image.txt', text: "${env.IMAGE}:${env.IMAGE_TAG}\n"
                    archiveArtifacts artifacts: 'image.txt'
                    echo "Pushed ${env.IMAGE}:${env.IMAGE_TAG} and ${env.IMAGE}:latest"
                }
            }
        }
    }
}
