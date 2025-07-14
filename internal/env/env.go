package env

import (
	"os"
	"strconv"
)

func GetString(key string, defaultKey string) string {
	value, exist := os.LookupEnv(key)

	if !exist {
		return defaultKey
	}

	return value
}

func GetInt(key string, defaultKey int) int {
	value, exist := os.LookupEnv(key)

	if !exist {
		return defaultKey
	}

	intValue, err := strconv.Atoi(value)

	if err != nil {
		panic(err)
	}

	return intValue
}
