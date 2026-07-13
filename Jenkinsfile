pipeline {
    agent { label 'docker' }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '30'))
    }

    environment {
        IMAGE = 'ghcr.io/swarmbot-it/swarmbot'
        REGISTRY_CREDENTIALS_ID = 'nh-jenkins-github-app-swarmbot'
    }

    stages {
        stage('CI') {
            when { changeRequest() }
            steps {
                script {
                    docker.image('node:24-alpine')
                          .inside("-e HOME=${env.WORKSPACE} -e npm_config_cache=${env.WORKSPACE}/.npm") {
                        sh 'npm ci'
                        sh 'npm run lint --if-present'
                        sh 'npm run test --if-present'
                    }
                }
            }
        }

        stage('Image') {
            steps {
                script {
                    String shortSha = (env.GIT_COMMIT ?: 'dev').take(7)
                    String tag = "${env.BUILD_NUMBER}-${shortSha}"
                    def image = docker.build(
                        "${env.IMAGE}:${tag}",
                        "--label org.opencontainers.image.source=https://github.com/swarmbot-it/swarmbot" +
                        " --label org.opencontainers.image.revision=${env.GIT_COMMIT ?: ''} ."
                    )
                    if (env.BRANCH_NAME == 'main') {
                        docker.withRegistry('https://ghcr.io', env.REGISTRY_CREDENTIALS_ID) {
                            image.push()
                            image.push('latest')
                        }
                        writeFile file: 'image.txt', text: "${env.IMAGE}:${tag}\n"
                        archiveArtifacts artifacts: 'image.txt'
                        echo "Pushed ${env.IMAGE}:${tag} and ${env.IMAGE}:latest"
                    } else {
                        echo 'Image built for validation only; pushed to GHCR from main.'
                    }
                }
            }
        }
    }
}
