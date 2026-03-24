package com.ddubeogation;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync
public class DdubeogationApplication {
    public static void main(String[] args) {
        SpringApplication.run(DdubeogationApplication.class, args);
    }
}
